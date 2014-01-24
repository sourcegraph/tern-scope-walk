var infer = require('tern/lib/infer');
var ast_walk = require('acorn/util/walk');

exports.walk = function(origins, f) {
  if (typeof origins == 'string') origins = [origins];
  var state = new State(origins, f);

  runPass(state.passes.preCondenseReach, state);

  for (var root in state.roots) {
    visitScope(root, state.roots[root], true, state);
  }
  visitScope('^', state.cx.topScope, true, state);

  state.cx.parent.files.forEach(function(file) {
    var path = '@' + file.name.replace(/\./g, '`');
    visitScope(path, file.scope, file.scope == state.cx.topScope, state);
    walkScopeNode(path, file.ast, state);
  });
}

function State(origins, f) {
  this.origins = origins;
  this.cx = infer.cx();
  this.passes = this.cx.parent && this.cx.parent.passes || {};
  this.roots = Object.create(null);
  this.seenAVals = [];
  this.seenScopes = [];
  this.f = f;
}

State.prototype.isTarget = function(origin) {
  return this.origins.indexOf(origin) > -1;
};

State.prototype.seenAVal = function(aval) {
  if (this.seenAVals.indexOf(aval) > -1) return true;
  this.seenAVals.push(aval);
  return false;
};

State.prototype.seenScope = function(scope) {
  if (this.seenScopes.indexOf(scope) > -1) return true;
  this.seenScopes.push(scope);
  return false;
};

function visitScope(path, scope, exported, state) {
  if (state.seenScope(scope)) return;
  for (var name in scope.props) {
    visitAVal(path + '.' + name, scope.props[name], exported, state);
  }

  if (scope.originNode) {
    walkScopeNode(path, scope.originNode, state);
  }
}

function visitAVal(path, aval, exported, state) {
  if (state.seenAVal(aval)) return;
  if (state.isTarget(aval.origin)) state.f(path, aval);

  var type = aval.getType(false);
  if (type && type.props) for (var name in type.props) {
    var propAVal = type.props[name];
    if (!aval.origin || propAVal.origin == aval.origin || exported) visitAVal(path + '.' + name, propAVal, exported, state);
  }
}

function walkScopeNode(path, node, state) {
  var w = ast_walk.make({
    Function: function (node, st, c) {
      var name;
      if (node.id && node.id.name != '✖') name = node.id.name;
      else name = ('@' + node.start);
      var path = st.path + '.' + name + '.@local';
      if (node.body.scope) {
        visitScope(path, node.body.scope, false, state);
      }
      c(node.body, {path: path});
    }
  });
  ast_walk.recursive(node, {path: path}, null, w);
}

function runPass(functions) {
  if (functions) for (var i = 0; i < functions.length; ++i)
    functions[i].apply(null, Array.prototype.slice.call(arguments, 1));
}

exports.collect = function(origins) {
  var avals = [];
  exports.walk(origins, function(path, aval) {
    avals[path] = aval;
  });
  return avals;
}

exports.collectPaths = function(origins) {
  var paths = [];
  exports.walk(origins, function(path, aval) {
    paths.push(path);
  });
  return paths;
}
