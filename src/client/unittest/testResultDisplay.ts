'use strict';
import * as vscode from 'vscode';
import {Tests, TestsToRun, TestFolder, TestFile, TestStatus, TestSuite, TestFunction} from './contracts';
import {PythonSettings} from '../common/configSettings';

const settings = PythonSettings.getInstance();

export class TestResultDisplay {
    private statusBar: vscode.StatusBarItem;
    constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBar.hide();
    }
    public UpdateResults(tests: Promise<Tests>) {
        this.statusBar.text = "Running tests (click to stop)";
        tests.then(this.updateWithSuccess.bind(this));
        tests.catch(this.updateWithFailure.bind(this));
    }

    private updateWithSuccess(tests: Tests) {
        let testResults = { pass: 0, fail: 0 };
        tests.testFunctions.forEach(current => {
            if (current.testFunction.passed === true) {
                testResults.pass += 1;
            }
            else if (current.testFunction.passed === false) {
                testResults.fail += 1;
            }
        });

        this.statusBar.text = `$(octicon octicon-check) ${testResults.pass} $(octicon octicon-x) ${testResults.fail}`;
        this.statusBar.command = 'python.viewTests';
        this.statusBar.show();
    }
    private updateWithFailure(reason: any) {
        this.statusBar.hide();
        vscode.window.showErrorMessage("There was an error in running the unit tests.");
    }
}