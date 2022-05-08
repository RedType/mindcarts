#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

import ClusterStack from '../lib/ClusterStack';
import MinecraftStack from '../lib/MinecraftStack';

const app = new cdk.App();

const { cluster, vpc } = new ClusterStack(app, 'ClusterStack');

const vanilla = new MinecraftStack(app, 'VanillaMinecraftStack', {
  cluster, vpc,
  containerImagePath: path.join(__dirname, '../../servers/vanilla'),
  subdomain: 'vanilla',
  zoneId: 'Z0231152107QS84FSIVK6',
});

app.synth();

