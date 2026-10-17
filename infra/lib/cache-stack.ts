import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps {
  envName: string;
  vpc: ec2.Vpc;
  ecsSecurityGroup: ec2.SecurityGroup;
}

export class CacheStack extends cdk.Stack {
  readonly redisEndpoint: string;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const redisSg = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc: props.vpc,
      securityGroupName: `ev-redis-sg-${props.envName}`,
      description: 'ElastiCache Redis — allow from ECS only',
    });
    redisSg.addIngressRule(props.ecsSecurityGroup, ec2.Port.tcp(6379), 'Redis from ECS');

    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: `ev-redis-subnet-${props.envName}`,
      subnetIds: props.vpc.privateSubnets.map(s => s.subnetId),
      cacheSubnetGroupName: `ev-redis-subnet-${props.envName}`,
    });

    // t2.micro (~$12/month) — sufficient for OCPP session state at pilot scale
    const redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: `ev-redis-${props.envName}`,
      cacheNodeType: 'cache.t2.micro',
      engine: 'redis',
      engineVersion: '7.0',
      numCacheClusters: 1,
      automaticFailoverEnabled: false,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      cacheSubnetGroupName: subnetGroup.ref,
      securityGroupIds: [redisSg.securityGroupId],
    });

    this.redisEndpoint = redis.attrPrimaryEndPointAddress;

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redis.attrPrimaryEndPointAddress,
      exportName: `ev-redis-endpoint-${props.envName}`,
    });
  }
}
