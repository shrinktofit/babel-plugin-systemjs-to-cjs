"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var babel = __importStar(require("@babel/core"));
function default_1(options) {
    options = options || {};
    var systemGlobal = options.systemGlobal || "System";
    return {
        visitor: {
            CallExpression: function (path) {
                if (!isSystemJSModuleRegister(path.node, systemGlobal)) {
                    return;
                }
                var detail = extractSystemJSModuleRegisterDetail(path.node);
                if (!detail) {
                    throw new Error("Bad System.register() invocation.");
                }
                var depends = detail.depends, moduleFunction = detail.moduleFunction;
                var bodys = [];
                for (var _i = 0, _a = moduleFunction.body.body; _i < _a.length; _i++) {
                    var statement = _a[_i];
                    if (statement.type === "ReturnStatement" && statement.argument) {
                        var depImports = depends.map(function (dep) { return babel.types.callExpression(babel.types.identifier("require"), [babel.types.stringLiteral(dep)]); });
                        bodys.push(buildCallReturnTemplate({
                            RETURN_ARGUMENT: statement.argument,
                            DEPENDS: babel.types.arrayExpression(depImports),
                        }));
                    }
                    else {
                        bodys.push(statement);
                    }
                }
                path.replaceWith(buildBodyTemplate({
                    STATEMENTS: bodys,
                }));
                var exportFuncName = moduleFunction.params[0].name;
                path.traverse({
                    CallExpression: function (path) {
                        if (path.node.callee.type === "Identifier" &&
                            path.node.callee.name === exportFuncName) {
                            path.replaceWith(transformSystemJSExportCall(path.node.arguments));
                        }
                    },
                });
            },
        },
    };
}
exports.default = default_1;
function isSystemJSModuleRegister(node, systemGlobal) {
    if (node.type !== "CallExpression") {
        return false;
    }
    var callee = node.callee, args = node.arguments;
    if (callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" && callee.property.type === "Identifier" &&
        callee.object.name === systemGlobal && callee.property.name === "register") {
        return true;
    }
    return false;
}
function extractSystemJSModuleRegisterDetail(node) {
    var args = node.arguments;
    var moduleNameArg = null;
    var depsArgs = null;
    var moduleFunction = null;
    switch (node.arguments.length) {
        case 2:
            depsArgs = args[0];
            moduleFunction = args[1];
            break;
        case 3:
            moduleNameArg = args[0];
            depsArgs = args[1];
            moduleFunction = args[2];
            break;
        default:
            return null;
    }
    var moduleName;
    if (moduleNameArg) {
        if (moduleNameArg.type === "StringLiteral") {
            moduleName = moduleNameArg.value;
        }
    }
    var depends = [];
    if (depsArgs.type === "ArrayExpression") {
        for (var _i = 0, _a = depsArgs.elements; _i < _a.length; _i++) {
            var element = _a[_i];
            if (element && element.type === "StringLiteral") {
                depends.push(element.value);
            }
        }
    }
    if (!isSystemJSModuleFunction(moduleFunction)) {
        return null;
    }
    return {
        moduleName: moduleName,
        depends: depends,
        moduleFunction: moduleFunction,
    };
}
function isSystemJSModuleFunction(argument) {
    return (argument.type === "FunctionExpression" &&
        argument.params.length === 2 &&
        argument.params[0].type === "Identifier" &&
        argument.params[1].type === "Identifier");
}
function transformSystemJSExportCall(callArguments) {
    if (callArguments.length === 2) {
        // _export: (name: String, value: any) => value
        var name_1 = callArguments[0];
        if (name_1.type === "StringLiteral") {
            return buildExportTemplate({
                EXPORT_NAME: babel.types.identifier(name_1.value),
                EXPRESSION: callArguments[1],
            });
        }
    }
    else if (callArguments.length === 1) {
        // _export: ({ [name: String]: any }) => value
        var obj = callArguments[0];
        if (obj.type === "ObjectExpression") {
            return buildExportBulk({
                BULK: obj,
            });
        }
    }
    throw new Error("Invalid systemjs export call.");
}
var buildExportTemplate = babel.template.expression("\n    module.exports.EXPORT_NAME = EXPRESSION\n");
var buildExportBulk = babel.template.expression("\n    module.exports = BULK\n");
var buildBodyTemplate = babel.template("\n    (function(){\n        STATEMENTS\n    })();\n");
var buildCallReturnTemplate = babel.template("\n    (function(arg, deps){\n        var setters = arg.setters;\n        // CALL SETTERS\n        for (var i = 0; i < deps.length; ++i) {\n            if (setters[i]) {\n                setters[i](deps[i]);\n            }\n        }\n        // CALL EXECUTE\n        arg.execute();\n    })(RETURN_ARGUMENT, DEPENDS);\n", { preserveComments: true });
//# sourceMappingURL=index.js.map