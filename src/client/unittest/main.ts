'use strict';

import * as vscode from 'vscode';
import {Tests, TestsToRun, TestFolder, TestFile, TestStatus, TestSuite, TestFunction} from './contracts';
import * as nosetests from './nosetestHelper';
import * as pytest from './pytestHelper';
import {BaseTestManager} from './testUtils';
import {PythonSettings} from '../common/configSettings';
import {runUnitTests} from './testProvider';
import {PythonUnitTest} from './unittest';
import {TestResultDisplay} from './testResultDisplay';
import {TestFileCodeLensProvider} from './testFileCodeLensProvider';

let testManager: BaseTestManager;
const settings = PythonSettings.getInstance();
let pyTestManager: pytest.TestManager;
let nosetestManager: nosetests.TestManager;
let unitTestRunner: PythonUnitTest;
let testDisplay: TestResultDisplay;

function initializeTestRunners(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    if (settings.unitTest.pyTestEnabled) {
        testManager = pyTestManager = pyTestManager ? pyTestManager : new pytest.TestManager(context, vscode.workspace.rootPath, outputChannel);
    }
    else if (settings.unitTest.nosetestsEnabled) {
        testManager = nosetestManager = nosetestManager ? nosetestManager : new nosetests.TestManager(context, vscode.workspace.rootPath, outputChannel);
    }
    else if (settings.unitTest.unittestEnabled) {
        unitTestRunner = unitTestRunner ? unitTestRunner : new PythonUnitTest(settings, outputChannel, vscode.workspace.rootPath);
        return runUnitTests([unitTestRunner], outputChannel);
    }
}

export function activate(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, symbolProvider: vscode.DocumentSymbolProvider) {
    let lastRanTests: TestsToRun = null;
    initializeTestRunners(context, outputChannel);
    context.subscriptions.push(vscode.languages.registerCodeLensProvider('python', new TestFileCodeLensProvider(context)));

    if (testManager) {
        // Yes swallow exceptions, we don't care    
        testManager.discoverTests().then(tests => {
            context.workspaceState.update('UnitTest.Tests', tests);
        }).catch(() => { });
    }

    context.subscriptions.push(vscode.commands.registerCommand('python.runtests', runTests));

    function runTests() {
        initializeTestRunners(context, outputChannel);

        if (settings.unitTest.unittestEnabled) {
            return runUnitTests([unitTestRunner], outputChannel);
        }

        if (!testManager) {
            vscode.window.showInformationMessage("Please enable one of the test frameworks (unittest, pytest or nosetest)");
            return;
        }

        runTestsImpl();
    }

    function runTestsImpl(testsToRun?: TestsToRun) {
        lastRanTests = testsToRun;
        testDisplay = testDisplay ? testDisplay : new TestResultDisplay(context, outputChannel);
        outputChannel.appendLine('\n');

        let runPromise = testManager.runTest(testsToRun).then(tests => {
            context.workspaceState.update('UnitTest.Tests', tests);
            if (tests.testFunctions.some(current => current.testFunction.passed === false)) {
                // Redisplay this if it was hidden, as we have errors
                outputChannel.show();
            }
            return tests;
        }).catch(reason => {
            outputChannel.appendLine('\nError: ' + reason)
            outputChannel.show();
            return Promise.reject(reason);
        });

        testDisplay.UpdateResults(runPromise);

        // Display this as the test manager will write to the output channel in realtime
        // outputChannel.show();
    }

    context.subscriptions.push(vscode.commands.registerCommand('python.runAllUnitTests', () => runTestsImpl()));
}