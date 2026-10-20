#!/usr/bin/env node
import { createCli } from '../dist/cli/index.js';

const program = createCli();
program.parse(process.argv);
