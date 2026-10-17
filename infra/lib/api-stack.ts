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
    const mongoSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'MongoSecret', `ev/${props.envName}/mongodb-uri`
    );
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
      containerInsights: true,
    });

    // ── Task execution role ────────────────────────────────────────────────────
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    [mongoSecret, jwtSecret, redisSecret, ocppAuthKey].forEach(s =>
      s.grantRead(executionRole)
    );

    // ── Shared container environment ───────────────────────────────────────────
    const sharedEnv: Record<string, ecs.Secret> = {
      MONGODB_URI:             ecs.Secret.fromSecretsManager(mongoSecret),
      JWT_SECRET:              ecs.Secret.fromSecretsManager(jwtSecret),
      REDIS_URL:               ecs.Secret.fromSecretsManager(redisSecret),
      OCPP_DEFAULT_AUTH_KEY:   ecs.Secret.fromSecretsManager(ocppAuthKey),
    };

    const sharedPlain: Record<string, string> = {
      NODE_ENV:            'production',
      COMMISSION_RATE_BPS: '1000',
      LOG_LEVEL:           'info',
    };

    const image = ecs.ContainerImage.fromEcrRepository(repo, 'latest');

    // ── REST API service ───────────────────────────────────────────────────────
    const apiTaskDef = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole,
    });
    apiTaskDef.addContainer('api', {
      image,
      containerName: 'api',
      secrets: sharedEnv,
      environment: { ...sharedPlain, PORT: '3000' },
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `ev-api-${props.envName}`,
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'wget -qO- http://localhost:3000/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
      },
    });

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition: apiTaskDef,
      serviceName: `ev-api-${props.envName}`,
      desiredCount: 2,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
    });

    // ── OCPP service ───────────────────────────────────────────────────────────
    const ocppTaskDef = new ecs.FargateTaskDefinition(this, 'OcppTask', {
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
    });
    ocppTaskDef.addContainer('ocpp', {
      image,
      containerName: 'ocpp',
      secrets: sharedEnv,
      environment: { ...sharedPlain, PORT: '3000', OCPP_PORT: '9000' },
      portMappings: [{ containerPort: 9000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `ev-ocpp-${props.envName}`,
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
    });

    const ocppService = new ecs.FargateService(this, 'OcppService', {
      cluster,
      taskDefinition: ocppTaskDef,
      serviceName: `ev-ocpp-${props.envName}`,
      desiredCount: 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
    });

    // ── ALB ────────────────────────────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `ev-alb-${props.envName}`,
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // HTTP → HTTPS redirect
    alb.addListener('Http', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS', port: '443', permanent: true,
      }),
    });

    // HTTPS listener — certificate ARN supplied via context
    const certArn = this.node.tryGetContext('certificateArn');
    const httpsListener = alb.addListener('Https', {
      port: 443,
      certificates: certArn
        ? [elbv2.ListenerCertificate.fromArn(certArn)]
        : [],
      // Without a cert in non-prod, fall back to HTTP on 80 — override in prod
      ...(certArn ? {} : { protocol: elbv2.ApplicationProtocol.HTTP, port: 80 }),
    });

    // /ocpp/* → OCPP target group (WebSocket, no stickiness — state in Redis)
    const ocppTg = new elbv2.ApplicationTargetGroup(this, 'OcppTg', {
      targetGroupName: `ev-ocpp-tg-${props.envName}`,
      vpc: props.vpc,
      port: 9000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [ocppService],
      healthCheck: { path: '/health', port: '3000' },
      stickinessCookieDuration: undefined,
    });

    // Default → REST API target group
    const apiTg = new elbv2.ApplicationTargetGroup(this, 'ApiTg', {
      targetGroupName: `ev-api-tg-${props.envName}`,
      vpc: props.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      healthCheck: { path: '/health', port: '3000' },
    });

    httpsListener.addAction('OcppRoute', {
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/ocpp/*'])],
      action: elbv2.ListenerAction.forward([ocppTg]),
    });
    httpsListener.addDefaultAction(elbv2.ListenerAction.forward([apiTg]));

    // ── Outputs ────────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlbDnsName',  { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'EcrRepoUri',  { value: repo.repositoryUri });
    new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'ApiServiceName',  { value: apiService.serviceName });
    new cdk.CfnOutput(this, 'OcppServiceName', { value: ocppService.serviceName });
  }
}
