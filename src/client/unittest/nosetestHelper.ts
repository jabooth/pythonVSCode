/// <reference path="../../../typings/globals/xml2js/index.d.ts" />

'use strict';
import * as path from 'path';
import {execPythonFile} from './../common/utils';
import {createDeferred, createTemporaryFile} from '../common/helpers';
import {OutputChannel, window} from 'vscode';
import {TestFile, TestsToRun, TestSuite, TestFunction, FlattenedTestFunction, Tests, TestStatus, FlattenedTestSuite} from './contracts';
import * as fs from 'fs';
import * as xml2js from 'xml2js';
import * as os from 'os';
import * as vscode from 'vscode';
import {extractBetweenDelimiters, convertFileToPackage, flattenTestFiles, updateResults, BaseTestManager} from './testUtils';

export class TestManager extends BaseTestManager {
    constructor(context: vscode.ExtensionContext, rootDirectory: string, outputChannel: vscode.OutputChannel) {
        super(context, rootDirectory, outputChannel)
    }
    discoverTestsImpl(): Promise<Tests> {
        return discoverTests(this.rootDirectory, []);
    }
    runTestImpl(testsToRun?: TestsToRun): Promise<any> {
        return runTest(this.rootDirectory, this.tests, testsToRun, this.stdOut.bind(this));
    }
}

interface TestCaseResult {
    $: {
        classname: string;
        file: string;
        line: string;
        name: string;
        time: string;
    };
    failure: {
        _: string;
        $: { message: string }
    }[];
}


export function runTest(rootDirectory: string, tests: Tests, testsToRun?: TestsToRun, stdOut?: (output: string) => void): Promise<any> {
    let testPaths = [];
    if (testsToRun && testsToRun.testFolder) {
        testPaths = testPaths.concat(testsToRun.testFolder.map(f => f.rawName));
    }
    if (testsToRun && testsToRun.testFile) {
        testPaths = testPaths.concat(testsToRun.testFile.map(f => f.rawName));
    }
    if (testsToRun && testsToRun.testSuite) {
        testPaths = testPaths.concat(testsToRun.testSuite.map(f => f.rawName));
    }
    if (testsToRun && testsToRun.testFunction) {
        testPaths = testPaths.concat(testsToRun.testFunction.map(f => f.rawName));
    }

    let xmlLogFile = '';
    let xmlLogFileCleanup: Function = null;
    let rawLogFile = '';
    let rawLogFileCleanup: Function = null;

    return createTemporaryFile('.xml').then(xmlLogResult => {
        xmlLogFile = xmlLogResult.filePath;
        xmlLogFileCleanup = xmlLogResult.cleanupCallback;
        return createTemporaryFile('.log');
    }).then(rawLowResult => {
        rawLogFile = rawLowResult.filePath;
        rawLogFileCleanup = rawLowResult.cleanupCallback;
        return execPythonFile('nosetests', ['--with-xunit', `--xunit-file=${xmlLogFile}`].concat(testPaths), rootDirectory, true, stdOut);
    }).then(() => {
        return updateResultsFromLogFiles(tests, xmlLogFile, rawLogFile);
    }).then(result => {
        xmlLogFileCleanup();
        rawLogFileCleanup();
        return result;
    }).catch(reason => {
        xmlLogFileCleanup();
        rawLogFileCleanup();
        return Promise.reject(reason);
    });
}

export function discoverTests(rootDirectory: string, args: string[]): Promise<Tests> {
    let logOutputLines: string[] = [''];
    let testFiles: TestFile[] = [];
    let collectionCountReported = false;
    function appendLine(line: string) {
        const lastLineIndex = logOutputLines.length - 1;
        logOutputLines[lastLineIndex] += line;

        // Check whether the previous line is something that we need
        // What we need is a line that ends with ? True
        //  and starts with nose.selector: DEBUG: want
        if (logOutputLines[lastLineIndex].endsWith('? True')) {
            logOutputLines.push('');
        }
        else {
            // We don't need this line
            logOutputLines[lastLineIndex] = '';
        }

    }
    function processOutput(output: string) {
        output.split(/\r?\n/g).forEach((line, index, lines) => {
            if (line.trim().startsWith('nose.selector: DEBUG: wantModule <module \'')) {
                // process the previous lines
                parseNoseTestModuleCollectionResult(rootDirectory, logOutputLines, testFiles);
                logOutputLines = [''];
            }

            if (index === 0) {
                if (output.startsWith(os.EOL) || lines.length > 1) {
                    appendLine(line);
                    return;
                }
                logOutputLines[logOutputLines.length - 1] += line;
                return;
            }
            if (index === lines.length - 1) {
                logOutputLines[logOutputLines.length - 1] += line;
                return;
            }
            appendLine(line);
            return;
        });
    }

    return execPythonFile('nosetests', args.concat(['--collect-only', '-vvv']), rootDirectory, true, processOutput)
        .then(() => {
            // process the last entry
            parseNoseTestModuleCollectionResult(rootDirectory, logOutputLines, testFiles);
            // Exclude tests that don't have any functions or test suites
            let indices = testFiles.filter(testFile => testFile.suites.length === 0 && testFile.functions.length === 0).map((testFile, index) => index);
            indices.sort();

            indices.forEach((indexToRemove, index) => {
                let newIndexToRemove = indexToRemove - index;
                testFiles.splice(newIndexToRemove, 1);
            });
            return flattenTestFiles(testFiles);
        });
}


export function updateResultsFromLogFiles(tests: Tests, outputXmlFile: string, outputRawFile: string): Promise<any> {
    return updateResultsFromXmlLogFile(tests, outputXmlFile).then(() => {
        return updateResultsFromRawLogFile(tests, outputRawFile);
    }).then(() => {
        updateResults(tests);
        return tests;
    });
}

function updateTestTestFileSuiteWithResult(tests: Tests, rawTestName: string, pass?: boolean, tracebackLines?: string[], errorMessage?: string) {
    let testFileSuite: TestFile | TestSuite;
    testFileSuite = tests.testFiles.find(f => f.rawName === rawTestName);
    if (!testFileSuite) {
        let suite = tests.testSuits.find(suite => suite.testSuite.rawName === rawTestName);
        if (suite) {
            testFileSuite = suite.testSuite;
        }
    }
    if (!testFileSuite) {
        let files = tests.testFiles.filter(f => f.rawName.endsWith(rawTestName));
        if (files.length === 1) {
            testFileSuite = files[0];
        }
        if (!testFileSuite) {
            let suites = tests.testSuits.filter(suite => suite.testSuite.rawName.endsWith(rawTestName));
            if (suites.length === 1) {
                testFileSuite = suites[0].testSuite;
            }
        }
    }
    if (!testFileSuite) {
        return;
    }
    if (typeof pass === 'boolean') {
        testFileSuite.passed = pass;
        testFileSuite.status = pass ? TestStatus.Idle : TestStatus.Error;
    }
    if (tracebackLines && tracebackLines.length > 0) {
        testFileSuite.traceback = tracebackLines.join('\r\n');
    }
    if (errorMessage && errorMessage.length > 0) {
        testFileSuite.message = errorMessage;
    }
}

function updateTestFunctionWithResult(tests: Tests, rawTestMethodName: string, pass?: boolean, tracebackLines?: string[], errorMessage?: string) {
    let fn = tests.testFunctions.find(fn => fn.testFunction.rawName === rawTestMethodName);
    if (!fn) {
        // Possible rawtestMethodName is a test file or a test suite
        updateTestTestFileSuiteWithResult(tests, rawTestMethodName, pass, tracebackLines, errorMessage);
        return;
    }
    const testFunction = fn.testFunction;
    if (typeof pass === 'boolean') {
        testFunction.passed = pass;
        testFunction.status = pass ? TestStatus.Idle : TestStatus.Error;
    }
    if (tracebackLines && tracebackLines.length > 0) {
        testFunction.traceback = tracebackLines.join('\r\n');
    }
    if (errorMessage && errorMessage.length > 0) {
        testFunction.message = errorMessage;
    }
}

function updateResultsFromRawLogFile(tests: Tests, outputRawFile: string): Promise<any> {
    let deferred = createDeferred<any>();
    fs.readFile(outputRawFile, 'utf8', (err, data) => {
        if (err) {
            return deferred.reject(err);
        }

        let isSuccess = true;
        let lastTestFunction: FlattenedTestFunction;
        let lastRawTestMethodName = '';
        let errorLines: string[] = [];
        const lines = data.split(/\r?\n/g);
        let errorMessage: string = '';

        lines.forEach(line => {
            if (line.startsWith('.')) {
                if (lastRawTestMethodName.length > 0) {
                    updateTestFunctionWithResult(tests, lastRawTestMethodName, null, errorLines, errorMessage);
                }
                lastRawTestMethodName = line.substring(1).trim();
                updateTestFunctionWithResult(tests, lastRawTestMethodName, true);

                lastRawTestMethodName = '';
                errorLines = [];
                errorMessage = '';
                return;
            }
            if (line.startsWith('F')) {
                if (lastRawTestMethodName.length > 0) {
                    updateTestFunctionWithResult(tests, lastRawTestMethodName, null, errorLines, errorMessage);

                    lastRawTestMethodName = '';
                }

                lastRawTestMethodName = line.substring(1).trim();
                updateTestFunctionWithResult(tests, lastRawTestMethodName, false);
                errorLines = [];
                errorMessage = '';
                return;
            }
            if (line.startsWith(' E')) {
                errorMessage = line.trim().substring(1);
                return;
            }

            errorLines.push(line);
        });

        if (lastRawTestMethodName.length > 0) {
            updateTestFunctionWithResult(tests, lastRawTestMethodName, null, errorLines, errorMessage);
        }

        deferred.resolve();
    });

    return deferred.promise;
}

function updateResultsFromXmlLogFile(tests: Tests, outputXmlFile: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        fs.readFile(outputXmlFile, 'utf8', (err, data) => {
            if (err) {
                return reject(err);
            }

            xml2js.parseString(data, (err, result) => {
                if (err) {
                    return reject(err);
                }

                (result.testsuite.testcase as TestCaseResult[]).forEach((testcase: TestCaseResult) => {
                    const xmlClassName = testcase.$.classname.replace(/\(\)/g, '').replace(/\.\./g, '.').replace(/\.\./g, '.').replace(/\.+$/, '');
                    let result = tests.testFunctions.find(fn => fn.xmlClassName === xmlClassName && fn.testFunction.name === testcase.$.name);
                    if (!result) {
                        // oops
                        return;
                    }

                    result.testFunction.line = parseInt(testcase.$.line);
                    result.testFunction.time = parseFloat(testcase.$.time);
                    result.testFunction.passed = true;
                    result.testFunction.status = TestStatus.Idle;

                    if (testcase.failure) {
                        result.testFunction.status = TestStatus.Error;
                        result.testFunction.passed = false;
                        result.testFunction.message = testcase.failure[0].$.message;
                        result.testFunction.traceback = testcase.failure[0]._;
                    }
                });

                resolve();
            });
        });
    });
}

function parseNoseTestModuleCollectionResult(rootDirectory: string, lines: string[], testFiles: TestFile[]) {
    let currentPackage: string = '';
    let fileName = '';
    let moduleName = '';
    let testFile: TestFile;
    lines.forEach(line => {
        let x = lines;
        let y = x;

        if (line.startsWith('nose.selector: DEBUG: wantModule <module \'')) {
            fileName = line.substring(line.indexOf('\' from \'') + '\' from \''.length);
            fileName = fileName.substring(0, fileName.lastIndexOf('\''));
            moduleName = line.substring(line.indexOf('nose.selector: DEBUG: wantModule <module \'') + 'nose.selector: DEBUG: wantModule <module \''.length);
            moduleName = moduleName.substring(0, moduleName.indexOf('\''));

            // We need to display the path relative to the current directory
            fileName = fileName.substring(rootDirectory.length + 1);
            currentPackage = convertFileToPackage(fileName);
            testFile = { functions: [], suites: [], name: fileName, rawName: fileName, xmlName: currentPackage, time: 0, functionsFailed: 0, functionsPassed: 0 };
            testFiles.push(testFile);
            return;
        }

        if (line.startsWith('nose.selector: DEBUG: wantClass <class \'')) {
            let name = extractBetweenDelimiters(line, 'nose.selector: DEBUG: wantClass <class \'', '\'>? True');
            const rawName = fileName + `:${name}`;
            const testSuite: TestSuite = { name: path.extname(name).substring(1), rawName: rawName, functions: [], suites: [], xmlName: name, time: 0, isUnitTest: false, isInstance: false, functionsFailed: 0, functionsPassed: 0 };
            testFile.suites.push(testSuite);
            return;
        }
        if (line.startsWith('nose.selector: DEBUG: wantClass ')) {
            let name = extractBetweenDelimiters(line, 'nose.selector: DEBUG: wantClass ', '? True');
            const rawName = fileName + `:${name}`;
            const testSuite: TestSuite = { name: path.extname(name).substring(1), rawName: rawName, functions: [], suites: [], xmlName: name, time: 0, isUnitTest: false, isInstance: false, functionsFailed: 0, functionsPassed: 0 };
            testFile.suites.push(testSuite);
            return;
        }
        if (line.startsWith('nose.selector: DEBUG: wantMethod <unbound method ')) {
            const name = extractBetweenDelimiters(line, 'nose.selector: DEBUG: wantMethod <unbound method ', '>? True');
            const fnName = path.extname(name).substring(1);
            const clsName = path.basename(name, path.extname(name));
            const fn: TestFunction = { name: fnName, rawName: fnName, time: 0, functionsFailed: 0, functionsPassed: 0 };

            let cls = testFile.suites.find(suite => suite.name === clsName);
            if (!cls) {
                debugger;
            }
            cls.functions.push(fn);
            return;
        }
        if (line.startsWith('nose.selector: DEBUG: wantFunction <function ')) {
            const name = extractBetweenDelimiters(line, 'nose.selector: DEBUG: wantFunction <function ', ' at ');
            const fn: TestFunction = { name: name, rawName: name, time: 0, functionsFailed: 0, functionsPassed: 0 };
            if (!testFile) {
                debugger;
            }
            testFile.functions.push(fn);
            return;
        }
    });
}
