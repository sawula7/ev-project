import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps {
  envName: string;
  vpc: ec2.Vpc;
  ecsSecurityGroup: ec2.SecurityGroup;
  albSecurityGroup: ec2.SecurityGroup;
  dbSecret: secretsmanager.ISecret;
  dbEndpoint: string;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // ── ECR ────────────────────────────────────────────────────────────────────
    const repo = new ecr.Repository(this, 'Repo', {
      repositoryName: `ev-backend-${props.envName}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    // ── Secrets ────────────────────────────────────────────────────────────────
    const jwtSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'JwtSecret', `ev/${props.envName}/jwt-secret`
    );
    const redisSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'RedisSecret', `ev/${props.envName}/redis-url`
    );
    const ocppAuthKey = secretsmanager.Secret.fromSecretNameV2(
      this, 'OcppAuthKey', `ev/${props.envName}/ocpp-default-auth-key`
    );

    // ── ECS Cluster ────────────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `ev-cluster-${props.envName}`,
      vpc: props.vpc,
      // Container Insights adds ~$5/month — disable for pilot, enable for prod
      containerInsights: props.envName === 'prod',
    });

    // ── Task execution role ────────────────────────────────────────────────────
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    [props.dbSecret, jwtSecret, redisSecret, ocppAuthKey].forEach(s =>
      s.grantRead(executionRole)
    );

    // ── Shared config ──────────────────────────────────────────────────────────
    // RDS's auto-generated secret holds only username/password — host/port/
    // dbname are assembled by the app from plain env vars (not secret: the
    // endpoint is just a DNS name).
    const sharedSecrets: Record<string, ecs.Secret> = {
      PGUSER:                ecs.Secret.fromSecretsManager(props.dbSecret, 'username'),
      PGPASSWORD:            ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
      JWT_SECRET:            ecs.Secret.fromSecretsManager(jwtSecret),
      REDIS_URL:             ecs.Secret.fromSecretsManager(redisSecret),
      OCPP_DEFAULT_AUTH_KEY: ecs.Secret.fromSecretsManager(ocppAuthKey),
    };

    const sharedEnv: Record<string, string> = {
      NODE_ENV:            'production',
      COMMISSION_RATE_BPS: '1000',
      LOG_LEVEL:           'info',
      PGHOST:              props.dbEndpoint,
      PGPORT:              '5432',
      PGDATABASE:          'ev_charging',
    };

    const image = ecs.ContainerImage.fromEcrRepository(repo, 'latest');

    // Graviton (ARM) tasks: 20% cheaper than x86 at same spec
    const runtimePlatform: ecs.RuntimePlatform = {
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      cpuArchitecture:       ecs.CpuArchitecture.ARM64,
    };

    // ── REST API task (Fargate Spot — up to 70% cheaper, handles interruptions) ─
    const apiTaskDef = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole,
      runtimePlatform,
    });
    apiTaskDef.addContainer('api', {
      image,
      containerName: 'api',
      secrets: sharedSecrets,
      environment: { ...sharedEnv, PORT: '3000' },
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `ev-api-${props.envName}`,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'wget -qO- http://localhost:3000/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
      },
    });

    // REST API: 1 task on Spot (stateless, safe to interrupt — reconnects to MongoDB/Redis)
    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition: apiTaskDef,
      serviceName: `ev-api-${props.envName}`,
      desiredCount: 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
      capacityProviderStrategies: [
        { capacityProvider: 'FARGATE_SPOT',   weight: 4 },
        { capacityProvider: 'FARGATE',         weight: 1 }, // fallback if no Spot available
      ],
    });

    // ── OCPP task (on-demand — WebSocket sessions must not be interrupted) ──────
    const ocppTaskDef = new ecs.FargateTaskDefinition(this, 'OcppTask', {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole,
      runtimePlatform,
    });
    ocppTaskDef.addContainer('ocpp', {
      image,
      containerName: 'ocpp',
      secrets: sharedSecrets,
      environment: { ...sharedEnv, PORT: '3000', OCPP_PORT: '9000' },
      portMappings: [{ containerPort: 9000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `ev-ocpp-${props.envName}`,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
    });

    // OCPP: on-demand only — Spot interruption would drop live charger connections
    const ocppService = new ecs.FargateService(this, 'OcppService', {
      cluster,
      taskDefinition: ocppTaskDef,
      serviceName: `ev-ocpp-${props.envName}`,
      desiredCount: 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
      capacityProviderStrategies: [
        { capacityProvider: 'FARGATE', weight: 1 },
      ],
    });

    // ── ALB ────────────────────────────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `ev-alb-${props.envName}`,
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // /ocpp/* → OCPP (WebSocket — no stickiness, state in Redis)
    const ocppTg = new elbv2.ApplicationTargetGroup(this, 'OcppTg', {
      targetGroupName: `ev-ocpp-tg-${props.envName}`,
      vpc: props.vpc,
      port: 9000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [ocppService],
      healthCheck: { path: '/health', port: '3000' },
    });

    // default → REST API
    const apiTg = new elbv2.ApplicationTargetGroup(this, 'ApiTg', {
      targetGroupName: `ev-api-tg-${props.envName}`,
      vpc: props.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      healthCheck: { path: '/health', port: '3000' },
    });

    const certArn = this.node.tryGetContext('certificateArn');
    let mainListener: elbv2.ApplicationListener;

    if (certArn) {
      // HTTP → HTTPS redirect, HTTPS does the real routing
      alb.addListener('Http', {
        port: 80,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS', port: '443', permanent: true,
        }),
      });
      mainListener = alb.addListener('Https', {
        port: 443,
        certificates: [elbv2.ListenerCertificate.fromArn(certArn)],
        defaultAction: elbv2.ListenerAction.forward([apiTg]),
      });
    } else {
      // No certificate yet (early dev) — plain HTTP on 80, no redirect.
      // Pass --context certificateArn=... once an ACM cert exists.
      mainListener = alb.addListener('Http', {
        port: 80,
        defaultAction: elbv2.ListenerAction.forward([apiTg]),
      });
    }

    mainListener.addAction('OcppRoute', {
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/ocpp/*'])],
      action: elbv2.ListenerAction.forward([ocppTg]),
    });

    // ── Outputs ────────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlbDnsName',       { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'EcrRepoUri',       { value: repo.repositoryUri });
    new cdk.CfnOutput(this, 'ClusterName',      { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'ApiServiceName',   { value: apiService.serviceName });
    new cdk.CfnOutput(this, 'OcppServiceName',  { value: ocppService.serviceName });
  }
}
