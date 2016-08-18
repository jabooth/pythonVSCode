// 'use strict';

// import * as vscode from 'vscode';
// import {Tests, TestsToRun, TestFolder, TestFile, TestStatus, TestSuite, TestFunction} from './contracts';
// import * as htmlGenerator from './htmlGenerator';
// import * as fs from 'fs';
// import * as nosetests from './nosetestHelper';
// import * as pytest from './pytestHelper';
// import {BaseTestManager} from './testUtils';
// import {PythonSettings} from '../common/configSettings';
// import {runUnitTests} from './testProvider';
// import {PythonUnitTest} from './unittest';

// const testSchema = 'python-test-explorer';

// let previewUri = vscode.Uri.parse(testSchema + '://authority/css-preview');
// let testManager: BaseTestManager;
// let filesRetreived: boolean;

// class TextDocumentContentProvider implements vscode.TextDocumentContentProvider {
//     private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
//     private tests: Tests;
//     private lastError: any;
//     private lastUri: vscode.Uri;
//     private getFilesInvoked: boolean;

//     public provideTextDocumentContent(uri: vscode.Uri): string {
//         if (!filesRetreived) {
//             filesRetreived = true;
//             testManager.discoverTests().then(tests => {
//                 this.tests = tests;
//                 this.lastError = null;
//                 this.update(uri);
//             }).catch(error => {
//                 this.lastError = error;
//                 this.update(uri);
//             });
//         }

//         return this.createTestExplorerView();
//     }

//     get onDidChange(): vscode.Event<vscode.Uri> {
//         return this._onDidChange.event;
//     }

//     public update(uri: vscode.Uri) {
//         this._onDidChange.fire(uri);
//     }

//     private createTestExplorerView(): string {
//         if (this.lastError) {
//             this.lastError = null;
//             return htmlGenerator.generateErrorView('Unknown Error', this.lastError);
//         } else {
//             let vw = this.generateTestExplorer();
//             fs.writeFileSync('/Users/donjayamanne/Desktop/Development/Node/testRunner/test.1.html', vw);
//             return vw;
//         }
//     }

//     private errorMessage(error: string): string {
//         return `
//             <body>
//                 ${error}
//             </body>`;
//     }

//     private generateTestExplorer(): string {
//         const now = new Date().toString();
//         let innerHtml = '';
//         let menuHtml = '';
//         let menuStyles = '';
//         let styles = '';

//         switch (testManager.status) {
//             case TestStatus.Unknown:
//             case TestStatus.Discovering: {
//                 innerHtml = htmlGenerator.generateDiscoveringHtmlView();
//                 styles = htmlGenerator.DISCOVER_STYLES;
//                 break;
//             }
//             case TestStatus.Idle: {
//                 menuStyles = htmlGenerator.MENU_STYLES;
//                 menuHtml = htmlGenerator.generateHtmlForMenu(testManager.status, this.tests);
//                 innerHtml = htmlGenerator.generateTestExplorerHtmlView(this.tests.rootTestFolders, testManager.status);
//                 styles = htmlGenerator.TREE_STYLES;
//                 break;
//             }
//             case TestStatus.Running: {
//                 innerHtml = htmlGenerator.generateRunningTestsHtmlView();
//                 styles = htmlGenerator.DISCOVER_STYLES;
//                 break;
//             }
//         }

//         return `<head>
//                 <link rel="stylesheet" href="file:///Users/donjayamanne/.vscode-insiders/extensions/pythonVSCode/resources/font-awesome-4.6.3/css/font-awesome.css">
//                 <style>
//                     body {
//                         black;
//                     }
//                 </style>
//                 ${htmlGenerator.COMMON_STYLES}
//                 ${styles}
//                 ${menuStyles}
//                 </head>
//                 <body>
//                     ${menuHtml}
//                     ${innerHtml}
//                 </body>
//                 `;
//     }
// }

// export function activate(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, symbolProvider: vscode.DocumentSymbolProvider) {
//     const settings = PythonSettings.getInstance();

//     let lastRanTests: TestsToRun = null;
//     let pyTestManager: pytest.TestManager;
//     let nosetestManager: nosetests.TestManager;
//     let unitTestRunner: PythonUnitTest;

//     if (settings.unitTest.pyTestEnabled) {
//         testManager = pyTestManager = pyTestManager ? pyTestManager : new pytest.TestManager(context, vscode.workspace.rootPath, outputChannel);
//     }
//     else if (settings.unitTest.nosetestsEnabled) {
//         testManager = nosetestManager = nosetestManager ? nosetestManager : new nosetests.TestManager(context, vscode.workspace.rootPath, outputChannel);
//     }

//     if (testManager) {
//         // Yes swallow exceptions, we don't care
//         testManager.discoverTests().catch(() => { });
//     }

//     let disposable = vscode.commands.registerCommand('python.runtests', () => {
//         filesRetreived = false;
//         if (settings.unitTest.unittestEnabled) {
//             unitTestRunner = unitTestRunner ? unitTestRunner : new PythonUnitTest(settings, outputChannel, vscode.workspace.rootPath);
//             return runUnitTests([unitTestRunner], outputChannel);
//         }

//         if (!testManager) {
//             vscode.window.showInformationMessage("Please enable one of the test framewors (unittest, pytest or nosetest)");
//             return;
//         }

//         return vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.One, 'Python Test Explorer').then((success) => {
//         }, (reason) => {
//             vscode.window.showErrorMessage(reason);
//         });
//     });
//     context.subscriptions.push(disposable);

//     function runTests(testsToRun?: TestsToRun) {
//         lastRanTests = testsToRun;
//         outputChannel.appendLine('\n');
//         testManager.runTest(testsToRun).then(() => {
//             provider.update(previewUri);
//         }).catch(err => {
//             provider.update(previewUri);
//             vscode.window.showErrorMessage('There was an error in running the tests, view the output Channel');
//             outputChannel.appendLine(err);
//         });
//         provider.update(previewUri);
//         outputChannel.show();
//     }

//     disposable = vscode.commands.registerCommand('python.runAllUnitTests', (runAll: boolean) => {
//         runTests();
//     });

//     // disposable = vscode.commands.registerCommand('python.runFailedTests', (type: string, rawPath: string) => {
//     //     // switch (type) {
//     //     //     case 'folder': {
//     //     //         break;
//     //     //     }
//     //     //     case 'file': {
//     //     //         break;
//     //     //     }
//     //     //     case 'suite': {
//     //     //         break;
//     //     //     }
//     //     //     case 'function': {
//     //     //         break;
//     //     //     }
//     //     // }
//     //     // testManager.discoverTests().then(tests => {
//     //     //     const failedFns = tests.testFunctions.filter(fn => fn.testFunction.passed === false).map(fn => fn.testFunction);
//     //     //     runTests(null, null, failedFns);
//     //     // });
//     // });

//     // disposable = vscode.commands.registerCommand('python.runPreviousTests', (type: string, rawPath: string) => {
//     //     runTests(lastRanTests);
//     // });

//     // disposable = vscode.commands.registerCommand('python.runUnitTest', (type: string, rawPath: string) => {
//     //     testManager.discoverTests().then(tests => {
//     //         outputChannel.appendLine('\n');
//     //         let testsToRun: TestsToRun = null;
//     //         switch (type) {
//     //             case 'folder': {
//     //                 testsToRun = { testFolder: [tests.testFolders.find(f => f.rawName === rawPath)] };
//     //                 break;
//     //             }
//     //             case 'file': {
//     //                 testsToRun = { testFile: [tests.testFiles.find(f => f.rawName === rawPath)] };
//     //                 break;
//     //             }
//     //             case 'suite': {
//     //                 testsToRun = { testSuite: [tests.testSuits.find(suite => suite.testSuite.rawName === rawPath).testSuite] };
//     //                 break;
//     //             }
//     //             default: {
//     //                 testsToRun = { testFunction: [tests.testFunctions.find(fn => fn.testFunction.rawName === rawPath).testFunction] };
//     //                 break;
//     //             }
//     //         }
//     //         runTests(testsToRun);
//     //     });
//     // });

//     // disposable = vscode.commands.registerCommand('python.discoverUnitTests', (runTests: boolean) => {
//     //     filesRetreived = false;
//     //     testManager.reset();
//     //     provider.update(previewUri);
//     // });

//     context.subscriptions.push(disposable);
// }