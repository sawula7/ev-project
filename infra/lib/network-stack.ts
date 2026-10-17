import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { FckNatInstanceProvider } from 'cdk-fck-nat';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps {
  envName: string;
}

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly ecsSecurityGroup: ec2.SecurityGroup;
  readonly albSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // fck-nat: t4g.nano (~$3/month) replaces NAT Gateway (~$35/month)
    const natProvider = new FckNatInstanceProvider({
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
    });

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `ev-vpc-${props.envName}`,
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: natProvider,
      subnetConfiguration: [
        { name: 'public',  subnetType: ec2.SubnetType.PUBLIC,              cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    // Allow fck-nat instance to pass traffic from private subnets
    natProvider.securityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
      'Allow VPC traffic through fck-nat',
    );

    // ALB: allow HTTPS + HTTP from internet
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      securityGroupName: `ev-alb-sg-${props.envName}`,
      description: 'ALB — allow 443/80 from internet',
    });
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80),  'HTTP redirect');

    // ECS tasks: allow inbound from ALB only
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc: this.vpc,
      securityGroupName: `ev-ecs-sg-${props.envName}`,
      description: 'ECS tasks — allow from ALB only',
    });
    this.ecsSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(3000), 'REST from ALB');
    this.ecsSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(9000), 'OCPP from ALB');

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
  }
}
