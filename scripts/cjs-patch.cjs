const Module = require('module');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.includes('simulation-core.js')) {
    const corePath = path.resolve(parent ? path.dirname(parent.filename) : process.cwd(), request);
    const code = fs.readFileSync(corePath, 'utf8');
    const sandbox = { module: { exports: {} }, Date };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.module.exports;
  }
  return originalLoad.apply(this, arguments);
};
