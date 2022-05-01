#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import MinecraftStack from '../lib/MinecraftStack';

const app = new cdk.App();
new MinecraftStack(app, 'MinecraftStack', {
});

