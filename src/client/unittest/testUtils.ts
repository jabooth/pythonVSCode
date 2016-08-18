import {TestFolder, TestsToRun, Tests, TestFile, TestSuite, TestFunction, TestStatus, FlattenedTestFunction, FlattenedTestSuite} from './contracts';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

export abstract class BaseTestManager {
    protected tests: Tests;
    private _status: TestStatus = TestStatus.Unknown;

    public get status(): TestStatus {
        return this._status;
    }
    constructor(private context: vscode.ExtensionContext, protected rootDirectory: string, private outputChannel: vscode.OutputChannel) {
        this._status = TestStatus.Unknown;
    }
    protected stdOut(output: string) {
        output.split(/\r?\n/g).forEach((line, index, lines) => {
            if (index === 0) {
                if (output.startsWith(os.EOL) || lines.length > 1) {
                    return this.outputChannel.appendLine(line);
                }
                return this.outputChannel.append(line);
            }
            if (index === lines.length - 1) {
                return this.outputChannel.append(line);
            }
            this.outputChannel.appendLine(line);
        });
    }
    public reset() {
        this._status = TestStatus.Unknown;
        this.tests = null;
    }
    public resetTestResults() {
        if (!this.tests) {
            return;
        }
        this.tests.testFolders.forEach(f => {
            f.functionsDidNotRun = 0;
            f.functionsFailed = 0;
            f.functionsPassed = 0;
            f.passed = null;
            f.status = TestStatus.Unknown;
        });
        this.tests.testFunctions.forEach(fn => {
            fn.testFunction.passed = null;
            fn.testFunction.time = 0;
            fn.testFunction.message = '';
            fn.testFunction.traceback = '';
            fn.testFunction.status = TestStatus.Unknown;
            fn.testFunction.functionsFailed = 0;
            fn.testFunction.functionsPassed = 0;
            fn.testFunction.functionsDidNotRun = 0;
        });
        this.tests.testSuits.forEach(suite => {
            suite.testSuite.passed = null;
            suite.testSuite.time = 0;
            suite.testSuite.status = TestStatus.Unknown;
            suite.testSuite.functionsFailed = 0;
            suite.testSuite.functionsPassed = 0;
            suite.testSuite.functionsDidNotRun = 0;
        });
        this.tests.testFiles.forEach(testFile => {
            testFile.passed = null;
            testFile.time = 0;
            testFile.status = TestStatus.Unknown;
            testFile.functionsFailed = 0;
            testFile.functionsPassed = 0;
            testFile.functionsDidNotRun = 0;
        });
    }
    private discoverTestsPromise: Promise<Tests>;
    discoverTests(): Promise<Tests> {
        if (this.discoverTestsPromise) {
            return this.discoverTestsPromise;
        }

        this._status = TestStatus.Discovering;

        this.discoverTestsPromise = this.discoverTestsImpl()
            .then(tests => {
                this.tests = tests;
                this._status = TestStatus.Idle
                this.resetTestResults();
                this.discoverTestsPromise = null;
                return tests;
            }).catch(reason => {
                this.tests = null;
                this._status = TestStatus.Error;
                this.discoverTestsPromise = null;
                return Promise.reject(reason);
            });

        return this.discoverTestsPromise;
    }
    abstract discoverTestsImpl(): Promise<Tests>;
    public runTest(testsToRun?: TestsToRun): Promise<Tests> {
        this.resetTestResults();
        this._status = TestStatus.Running;

        return this.discoverTests()
            .then(() => {
                return this.runTestImpl(testsToRun);
            }).then(() => {
                this._status = TestStatus.Idle;
                return this.tests;
            }).catch(reason => {
                this._status = TestStatus.Error;
                return Promise.reject(reason);
            });
    }
    abstract runTestImpl(testsToRun?: TestsToRun): Promise<any>;
}

export function extractBetweenDelimiters(content: string, startDelimiter: string, endDelimiter: string): string {
    content = content.substring(content.indexOf(startDelimiter) + startDelimiter.length);
    return content.substring(0, content.lastIndexOf(endDelimiter));
}

export function convertFileToPackage(filePath: string): string {
    let lastIndex = filePath.lastIndexOf('.');
    return filePath.substring(0, lastIndex).replace(/\//g, '.').replace(/\\/g, '.');
}

export function updateResults(tests: Tests) {
    tests.testFiles.forEach(updateResultsUpstream);
    tests.testFolders.forEach(updateFolderResultsUpstream);
}

export function updateFolderResultsUpstream(testFolder: TestFolder) {
    let totalTime = 0;
    let allFilesPassed = true;
    let allFilesRan = true;

    testFolder.testFiles.forEach(fl => {
        if (allFilesPassed && typeof fl.passed === 'boolean') {
            if (!fl.passed) {
                allFilesPassed = false;
            }
        }
        else {
            allFilesRan = false;
        }

        testFolder.functionsFailed += fl.functionsFailed;
        testFolder.functionsPassed += fl.functionsPassed;
    });

    let allFoldersPassed = true;
    let allFoldersRan = true;

    testFolder.folders.forEach(folder => {
        updateFolderResultsUpstream(folder);
        if (allFoldersPassed && typeof folder.passed === 'boolean') {
            if (!folder.passed) {
                allFoldersPassed = false;
            }
        }
        else {
            allFoldersRan = false;
        }

        testFolder.functionsFailed += folder.functionsFailed;
        testFolder.functionsPassed += folder.functionsPassed;
    });

    if (allFilesRan && allFoldersRan) {
        testFolder.passed = allFilesPassed && allFoldersPassed;
        testFolder.status = testFolder.passed ? TestStatus.Idle : TestStatus.Error;
    }
    else {
        testFolder.passed = null;
        testFolder.status = TestStatus.Unknown;
    }
}

export function updateResultsUpstream(test: TestSuite | TestFile) {
    let totalTime = 0;
    let allFunctionsPassed = true;
    let allFunctionsRan = true;

    test.functions.forEach(fn => {
        totalTime += fn.time;
        if (typeof fn.passed === 'boolean') {
            if (fn.passed) {
                test.functionsPassed += 1;
            }
            else {
                test.functionsFailed += 1;
                allFunctionsPassed = false;
            }
        }
        else {
            allFunctionsRan = false;
        }
    });

    let allSuitesPassed = true;
    let allSuitesRan = true;

    test.suites.forEach(suite => {
        updateResultsUpstream(suite);
        totalTime += suite.time;
        if (allSuitesRan && typeof suite.passed === 'boolean') {
            if (!suite.passed) {
                allSuitesPassed = false;
            }
        }
        else {
            allSuitesRan = false;
        }

        test.functionsFailed += suite.functionsFailed;
        test.functionsPassed += suite.functionsPassed;
    });

    test.time = totalTime;
    if (allSuitesRan && allFunctionsRan) {
        test.passed = allFunctionsPassed && allSuitesPassed;
        test.status = test.passed ? TestStatus.Idle : TestStatus.Error;
    }
    else {
        test.passed = null;
        test.status = TestStatus.Unknown;
    }
}

export function placeTestFilesInFolders(tests: Tests) {
    // First get all the unique folders
    const folders: string[] = [];
    tests.testFiles.forEach(file => {
        let dir = path.dirname(file.name);
        if (folders.indexOf(dir) === -1) {
            folders.push(dir);
        }
    });

    tests.testFolders = [];
    const folderMap = new Map<string, TestFolder>();
    folders.sort();

    folders.forEach(dir => {
        dir.split(path.sep).reduce((parentPath, currentName, index, values) => {
            let newPath = currentName;
            let parentFolder: TestFolder;
            if (parentPath.length > 0) {
                parentFolder = folderMap.get(parentPath);
                newPath = path.join(parentPath, currentName);
            }
            if (!folderMap.has(newPath)) {
                const testFolder: TestFolder = { name: newPath, testFiles: [], folders: [], rawName: newPath, time: 0 };
                folderMap.set(newPath, testFolder);
                if (parentFolder) {
                    parentFolder.folders.push(testFolder);
                }
                else {
                    tests.rootTestFolders.push(testFolder);
                }
                tests.testFiles.filter(fl => path.dirname(fl.name) === newPath).forEach(testFile => {
                    testFolder.testFiles.push(testFile);
                });
                tests.testFolders.push(testFolder);
            }
            return newPath;
        }, '');
    });
}
export function flattenTestFiles(testFiles: TestFile[]): Tests {
    let fns: FlattenedTestFunction[] = [];
    let suites: FlattenedTestSuite[] = [];
    testFiles.forEach(testFile => {
        // sample test_three (file name without extension and all / replaced with ., meaning this is the package)
        const packageName = convertFileToPackage(testFile.name);

        testFile.functions.forEach(fn => {
            fns.push({ testFunction: fn, xmlClassName: packageName, parentTestFile: testFile });
        });

        testFile.suites.forEach(suite => {
            suites.push({ parentTestFile: testFile, testSuite: suite, xmlClassName: suite.xmlName });
            flattenTestSuites(fns, suites, testFile, suite);
        });
    });

    let tests = { testFiles: testFiles, testFunctions: fns, testSuits: suites, testFolders: [], rootTestFolders: [] };
    placeTestFilesInFolders(tests);

    return tests;
}
export function flattenTestSuites(flattenedFns: FlattenedTestFunction[], flattenedSuites: FlattenedTestSuite[], testFile: TestFile, testSuite: TestSuite) {
    testSuite.functions.forEach(fn => {
        flattenedFns.push({ testFunction: fn, xmlClassName: testSuite.xmlName, parentTestFile: testFile, parentTestSuite: testSuite });
    });

    // We may have child classes
    testSuite.suites.forEach(suite => {
        flattenedSuites.push({ parentTestFile: testFile, testSuite: suite, xmlClassName: suite.xmlName });
        flattenTestSuites(flattenedFns, flattenedSuites, testFile, suite);
    });
}
