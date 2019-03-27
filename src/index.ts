import * as babel from "@babel/core";

interface IOptions {
    systemGlobal?: string;
}

type ArgumentType = babel.types.Expression | babel.types.SpreadElement | babel.types.JSXNamespacedName | babel.types.ArgumentPlaceholder;

export default function(options?: IOptions): babel.PluginObj {
    options = options || {};
    const systemGlobal = options.systemGlobal || "System";
    return {
        visitor: {
            CallExpression(path) {
                if (!isSystemJSModuleRegister(path.node, systemGlobal)) {
                    return;
                }

                const detail = extractSystemJSModuleRegisterDetail(path.node);
                if (!detail) {
                    throw new Error(`Bad System.register() invocation.`);
                }

                const { depends, moduleFunction } = detail;

                const bodys: babel.types.Statement[] = [];
                for (const statement of moduleFunction.body.body) {
                    if (statement.type === "ReturnStatement" && statement.argument) {
                        const depImports = depends.map(
                            (dep) => babel.types.callExpression(
                                    babel.types.identifier("require"),
                                    [babel.types.stringLiteral(dep)],
                                ),
                        );
                        bodys.push(buildCallReturnTemplate({
                            RETURN_ARGUMENT: statement.argument,
                            DEPENDS: babel.types.arrayExpression(depImports),
                        }) as babel.types.Statement);
                    } else {
                        bodys.push(statement);
                    }
                }

                path.replaceWith(buildBodyTemplate({
                    STATEMENTS: bodys,
                }) as babel.types.Statement);

                const exportFuncName = moduleFunction.params[0].name;
                path.traverse({
                    CallExpression(path) {
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

type ISystemJSModuleRegister = babel.types.CallExpression;

function isSystemJSModuleRegister(node: babel.types.Node, systemGlobal: string): node is ISystemJSModuleRegister {
    if (node.type !== "CallExpression") {
        return false;
    }
    const { callee, arguments: args } = node;

    if (callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" && callee.property.type === "Identifier" &&
        callee.object.name === systemGlobal && callee.property.name === "register") {
        return true;
    }

    return false;
}

interface ISystemJSModuleRegisterDetail {
    moduleName?: string;
    depends: string[];
    moduleFunction: ISystemJSModuleFunciton;
}

function extractSystemJSModuleRegisterDetail(node: ISystemJSModuleRegister): ISystemJSModuleRegisterDetail | null {
    const { arguments: args } = node;

    let moduleNameArg: ArgumentType | null = null;
    let depsArgs: ArgumentType | null = null;
    let moduleFunction: ArgumentType | null = null;
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

    let moduleName: string | undefined;
    if (moduleNameArg) {
        if (moduleNameArg.type === "StringLiteral") {
            moduleName = moduleNameArg.value;
        }
    }

    const depends: string[] = [];
    if (depsArgs.type === "ArrayExpression") {
        for (const element of depsArgs.elements) {
            if (element && element.type === "StringLiteral") {
                depends.push(element.value);
            }
        }
    }

    if (!isSystemJSModuleFunction(moduleFunction)) {
        return null;
    }

    return {
        moduleName,
        depends,
        moduleFunction,
    };
}

interface ISystemJSModuleFunciton extends babel.types.FunctionExpression {
    params: [babel.types.Identifier, babel.types.Identifier];
}

function isSystemJSModuleFunction(argument: ArgumentType): argument is ISystemJSModuleFunciton {
    return (
        argument.type === "FunctionExpression" &&
        argument.params.length === 2 &&
        argument.params[0].type === "Identifier" &&
        argument.params[1].type === "Identifier"
    );
}

function transformSystemJSExportCall(callArguments: ArgumentType[]) {
    if (callArguments.length === 2) {
        // _export: (name: String, value: any) => value
        const name = callArguments[0];
        if (name.type === "StringLiteral") {
            return buildExportTemplate({
                EXPORT_NAME: babel.types.identifier(name.value),
                EXPRESSION: callArguments[1],
            });
        }
    } else if (callArguments.length === 1) {
        // _export: ({ [name: String]: any }) => value
        const obj = callArguments[0];
        if (obj.type === "ObjectExpression") {
            return buildExportBulk({
                BULK: obj,
            });
        }
    }
    throw new Error(`Invalid systemjs export call.`);
}

const buildExportTemplate = babel.template.expression(`
    module.exports.EXPORT_NAME = EXPRESSION
`);

const buildExportBulk = babel.template.expression(`
    module.exports = BULK
`);

const buildBodyTemplate = babel.template(`
    (function(){
        STATEMENTS
    })();
`);

const buildCallReturnTemplate = babel.template(`
    (function(arg, deps){
        var setters = arg.setters;
        // CALL SETTERS
        for (var i = 0; i < deps.length; ++i) {
            if (setters[i]) {
                setters[i](deps[i]);
            }
        }
        // CALL EXECUTE
        arg.execute();
    })(RETURN_ARGUMENT, DEPENDS);
`, {preserveComments: true});
