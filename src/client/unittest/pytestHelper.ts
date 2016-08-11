/// <reference path="../../../typings/globals/xml2js/index.d.ts" />

'use strict';
import {execPythonFile} from './../common/utils';
import {createDeferred, createTemporaryFile} from '../common/helpers';
import {OutputChannel, window} from 'vscode';
import {TestFile, TestsToRun, TestSuite, TestFunction, FlattenedTestFunction, Tests, TestStatus, FlattenedTestSuite} from './contracts';
import * as fs from 'fs';
import * as xml2js from 'xml2js';
import * as os from 'os';
import {BaseTestManager, extractBetweenDelimiters, flattenTestFiles, updateResults, convertFileToPackage} from './testUtils';
import * as vscode from 'vscode';

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

export class TestManager extends BaseTestManager {
    constructor(rootDirectory: string, outputChannel: vscode.OutputChannel) {
        super(rootDirectory, outputChannel)
    }
    discoverTestsImpl(): Promise<Tests> {
        return discoverTests(this.rootDirectory);
    }
    runTestImpl(testsToRun?: TestsToRun): Promise<any> {
        return runTest(this.rootDirectory, this.tests, testsToRun, this.stdOut.bind(this));
    }
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
        return execPythonFile('py.test', [`--junitxml=${xmlLogFile}`, `--resultlog=${rawLogFile}`].concat(testPaths), rootDirectory, true, stdOut);
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

export function discoverTests(rootDirectory: string): Promise<Tests> {
    let logOutputLines: string[] = [''];
    let testFiles: TestFile[] = [];
    let parentNodes: { indent: number, item: TestFile | TestSuite }[] = [];
    let collectionCountReported = false;
    function processOutput(output: string) {
        output.split(/\r?\n/g).forEach((line, index, lines) => {
            if (line.trim().startsWith('<Module \'')) {
                // process the previous lines
                parsePyTestModuleCollectionResult(logOutputLines, testFiles, parentNodes);
                logOutputLines = [''];
            }

            if (index === 0) {
                if (output.startsWith(os.EOL) || lines.length > 1) {
                    logOutputLines[logOutputLines.length - 1] += line;
                    logOutputLines.push('');
                    return;
                }
                logOutputLines[logOutputLines.length - 1] += line;
                return;
            }
            if (index === lines.length - 1) {
                logOutputLines[logOutputLines.length - 1] += line;
                return;
            }
            logOutputLines[logOutputLines.length - 1] += line;
            logOutputLines.push('');
            return;
        });
    }

    let args = [];
    return execPythonFile('py.test', args.concat(['--collect-only']), rootDirectory, false, processOutput)
        .then(() => {
            // process the last entry
            parsePyTestModuleCollectionResult(logOutputLines, testFiles, parentNodes);
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

const DELIMITER = '\'';
const DEFAULT_CLASS_INDENT = 2;

function parsePyTestModuleCollectionResult(lines: string[], testFiles: TestFile[], parentNodes: { indent: number, item: TestFile | TestSuite }[]) {
    let currentPackage: string = '';

    lines.forEach(line => {
        const trimmedLine = line.trim();
        const name = extractBetweenDelimiters(trimmedLine, DELIMITER, DELIMITER);
        const indent = line.indexOf('<');

        if (trimmedLine.startsWith('<Module \'')) {
            currentPackage = convertFileToPackage(name);
            const testFile = { functions: [], suites: [], name: name, rawName: name, xmlName: currentPackage, time: 0 };
            testFiles.push(testFile);
            parentNodes.push({ indent: indent, item: testFile });
            return;
        }

        const parentNode = findParentOfCurrentItem(indent, parentNodes);

        if (trimmedLine.startsWith('<Class \'') || trimmedLine.startsWith('<UnitTestCase \'')) {
            const isUnitTest = trimmedLine.startsWith('<UnitTestCase \'');
            const rawName = parentNode.item.rawName + `::${name}`;
            const xmlName = parentNode.item.xmlName + `.${name}`;
            const testSuite: TestSuite = { name: name, rawName: rawName, functions: [], suites: [], isUnitTest: isUnitTest, isInstance: false, xmlName: xmlName, time: 0 };
            parentNode.item.suites.push(testSuite);
            parentNodes.push({ indent: indent, item: testSuite });
            return;
        }
        if (trimmedLine.startsWith('<Instance \'')) {
            let suite = (parentNode.item as TestSuite);
            // suite.rawName = suite.rawName + '::()';
            // suite.xmlName = suite.xmlName + '.()';
            suite.isInstance = true;
            return;
        }
        if (trimmedLine.startsWith('<TestCaseFunction \'') || trimmedLine.startsWith('<Function \'')) {
            const rawName = parentNode.item.rawName + '::' + name;
            const fn: TestFunction = { name: name, rawName: rawName, time: 0 };
            parentNode.item.functions.push(fn);
            return;
        }
    });
}

function parsePyTestCollectionResult(output: String) {
    let lines = output.split(/\r?\n/g);
    const startIndex = lines.findIndex(value => value.trim().startsWith('<Module \''));
    if (startIndex === -1) return [];
    lines = lines.slice(startIndex);

    const testFiles: TestFile[] = [];
    const parentNodes: { indent: number, item: TestFile | TestSuite }[] = [];
    let currentPackage: string = '';

    lines.forEach(line => {
        const trimmedLine = line.trim();
        const name = extractBetweenDelimiters(trimmedLine, DELIMITER, DELIMITER);
        const indent = line.indexOf('<');

        if (trimmedLine.startsWith('<Module \'')) {
            currentPackage = convertFileToPackage(name);
            const testFile = { functions: [], suites: [], name: name, rawName: name, xmlName: currentPackage, time: 0 };
            testFiles.push(testFile);
            parentNodes.push({ indent: indent, item: testFile });
            return;
        }

        const parentNode = findParentOfCurrentItem(indent, parentNodes);

        if (trimmedLine.startsWith('<Class \'') || trimmedLine.startsWith('<UnitTestCase \'')) {
            const isUnitTest = trimmedLine.startsWith('<UnitTestCase \'');
            const rawName = parentNode.item.rawName + `::${name}`;
            const xmlName = parentNode.item.xmlName + `.${name}`;
            const testSuite: TestSuite = { name: name, rawName: rawName, functions: [], suites: [], isUnitTest: isUnitTest, isInstance: false, xmlName: xmlName, time: 0 };
            parentNode.item.suites.push(testSuite);
            parentNodes.push({ indent: indent, item: testSuite });
            return;
        }
        if (trimmedLine.startsWith('<Instance \'')) {
            let suite = (parentNode.item as TestSuite);
            // suite.rawName = suite.rawName + '::()';
            // suite.xmlName = suite.xmlName + '.()';
            suite.isInstance = true;
            return;
        }
        if (trimmedLine.startsWith('<TestCaseFunction \'') || trimmedLine.startsWith('<Function \'')) {
            const rawName = parentNode.item.rawName + '::' + name;
            const fn: TestFunction = { name: name, rawName: rawName, time: 0 };
            parentNode.item.functions.push(fn);
            return;
        }
    });

    return testFiles;
}

function findParentOfCurrentItem(indentOfCurrentItem: number, parentNodes: { indent: number, item: TestFile | TestSuite }[]): { indent: number, item: TestFile | TestSuite } {
    while (parentNodes.length > 0) {
        let parentNode = parentNodes[parentNodes.length - 1];
        if (parentNode.indent < indentOfCurrentItem) {
            return parentNode;
        }
        parentNodes.pop();
        continue;
    }

    return null;
}

/* Sample output from py.test --collect-only
<Module 'test_another.py'>
  <Class 'Test_CheckMyApp'>
    <Instance '()'>
      <Function 'test_simple_check'>
      <Function 'test_complex_check'>
<Module 'test_one.py'>
  <UnitTestCase 'Test_test1'>
    <TestCaseFunction 'test_A'>
    <TestCaseFunction 'test_B'>
<Module 'test_two.py'>
  <UnitTestCase 'Test_test1'>
    <TestCaseFunction 'test_A2'>
    <TestCaseFunction 'test_B2'>
<Module 'testPasswords/test_Pwd.py'>
  <UnitTestCase 'Test_Pwd'>
    <TestCaseFunction 'test_APwd'>
    <TestCaseFunction 'test_BPwd'>
<Module 'testPasswords/test_multi.py'>
  <Class 'Test_CheckMyApp'>
    <Instance '()'>
      <Function 'test_simple_check'>
      <Function 'test_complex_check'>
      <Class 'Test_NestedClassA'>
        <Instance '()'>
          <Function 'test_nested_class_methodB'>
          <Class 'Test_nested_classB_Of_A'>
            <Instance '()'>
              <Function 'test_d'>
  <Function 'test_username'>
  <Function 'test_parametrized_username[one]'>
  <Function 'test_parametrized_username[two]'>
  <Function 'test_parametrized_username[three]'>
*/
