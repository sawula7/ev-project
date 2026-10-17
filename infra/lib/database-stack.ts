import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps {
  envName: string;
  vpc: ec2.Vpc;
  ecsSecurityGroup: ec2.SecurityGroup;
}

export class DatabaseStack extends cdk.Stack {
  readonly dbSecret: secretsmanager.ISecret;
  readonly dbEndpoint: string;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: props.vpc,
      securityGroupName: `ev-db-sg-${props.envName}`,
      description: 'RDS Postgres — allow from ECS only',
    });
    dbSg.addIngressRule(props.ecsSecurityGroup, ec2.Port.tcp(5432), 'Postgres from ECS');

    const credentials = rds.Credentials.fromGeneratedSecret('postgres', {
      secretName: `ev/${props.envName}/db-credentials`,
    });

    // db.t4g.micro (~$12/month) — Graviton, adequate for pilot scale
    const instance = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSg],
      databaseName: 'ev_charging',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      deletionProtection: props.envName === 'prod',
      removalPolicy: props.envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      backupRetention: props.envName === 'prod' ? cdk.Duration.days(7) : cdk.Duration.days(1),
      multiAz: false, // enable for prod once traffic justifies the 2x cost
    });

    this.dbSecret = instance.secret!;
    this.dbEndpoint = instance.dbInstanceEndpointAddress;

    new cdk.CfnOutput(this, 'DbEndpoint', { value: instance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbSecret.secretArn });
  }
}
