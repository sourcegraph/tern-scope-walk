var infer = require('tern/lib/infer');
var ast_walk = require('acorn/util/walk');

exports.walk = function(origins) {
  if (typeof origins == 'string') origins = [origins];
  var state = new State(origins);

  runPass(state.passes.preCondenseReach, state);

  for (var root in state.roots) {
    visitScope(root, state.roots[root], true, state);
  }
  state.currentFile = null;
  visitScope('^', state.cx.topScope, true, state);

  state.cx.parent.files.forEach(function(file) {
    var path = '@' + file.name.replace(/\./g, '`');
    state.currentFile = file.name;
    visitScope(path, file.scope, file.scope == state.cx.topScope, state);
    walkScopeNode(path, file.ast, state);
    state.currentFile = null;
  });

  return state.output;
}

function State(origins) {
  this.origins = origins;
  this.cx = infer.cx();
  this.passes = this.cx.parent && this.cx.parent.passes || {};
  this.roots = Object.create(null);
  this.seenAVals = [];
  this.seenScopes = [];
  this.output = Object.create(null);
  this.currentFile = null;
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
  state.currentFile = scope.origin;
  if (state.seenScope(scope)) return;
  for (var name in scope.props) {
    var av = scope.props[name];
    if (!scope.origin) state.currentFile = av.origin;
    visitAVal(path + '.' + name, av, exported, state);
  }
  state.currentFile = null;

  if (scope.originNode) {
    walkScopeNode(path, scope.originNode, state);
  }
}

function visitAVal(path, aval, exported, state) {
  var oldPath = aval._path, oldVisitedInFile = aval._visitedInFile, oldExported = aval._exported;

  var betterFileMatch = aval.originNode && (oldVisitedInFile != astNodeFilename(aval.originNode) && state.currentFile == astNodeFilename(aval.originNode));
  var worseFileMatch = aval.originNode && (oldVisitedInFile == astNodeFilename(aval.originNode) && state.currentFile != astNodeFilename(aval.originNode));
//  if (path[0] != '^') console.error('###', path, 'oldVisitedInFile='+aval._visitedInFile, 'astNodeFilename='+aval.originNode ? astNodeFilename(aval.originNode) : '(no originNode)');
  if (path[0] != '^' && path.indexOf('extend') > -1) console.error('###', path, 'originNode?=' + !!aval.originNode, 'oldVisitedInFile='+aval._visitedInFile, 'betterFile='+betterFileMatch,'worseFile='+worseFileMatch, 'currentFile='+state.currentFile, 'astNodeFilename='+astNodeFilename(aval.originNode));
  var betterOtherHeuristics = (!oldExported && exported) || !oldPath || path.length < oldPath.length;
  var better = !state.seenAVal(aval) || betterFileMatch || (!worseFileMatch && betterOtherHeuristics);

  if (better) {
    aval._path = path;
    aval._visitedInFile = state.currentFile;
    aval._exported = exported;
    if (state.isTarget(aval.origin)) {
      state.output[path] = aval;
      if (oldPath) delete state.output[oldPath];
    }

    var type = aval.getType(false);
    if (type && type.props) for (var name in type.props) {
      var propAVal = type.props[name];
      visitAVal(path + '.' + name, propAVal, exported, state);
    }
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


function astNodeFilename(node) {
  // Sometimes a node doesn't have a sourceFile property but one of its
  // child nodes does. In that case, get sourceFile from the child node.
  // TODO(sqs): why does this occur?
  if (!node.sourceFile) {
    var childNode = node.property || node.argument || node.left;
    node.sourceFile = childNode.sourceFile;
  }
  return node.sourceFile.name;
}

exports.collect = function(origins) {
  return exports.walk(origins);
}

exports.collectPaths = function(origins) {
  return Object.keys(exports.walk(origins));
}
