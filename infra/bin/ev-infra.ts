#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { CacheStack } from '../lib/cache-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-southeast-1',
};

const envName = app.node.tryGetContext('env') ?? 'prod';

const network = new NetworkStack(app, `ev-network-${envName}`, { env, envName });

const cache = new CacheStack(app, `ev-cache-${envName}`, {
  env,
  envName,
  vpc: network.vpc,
  ecsSecurityGroup: network.ecsSecurityGroup,
});

new ApiStack(app, `ev-api-${envName}`, {
  env,
  envName,
  vpc: network.vpc,
  ecsSecurityGroup: network.ecsSecurityGroup,
  albSecurityGroup: network.albSecurityGroup,
});

new FrontendStack(app, `ev-frontend-${envName}`, { env, envName });
