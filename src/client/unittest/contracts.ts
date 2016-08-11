export interface TestFolder extends TestResult {
    name: string;
    testFiles: TestFile[];
    rawName: string;
    status?: TestStatus;
    folders: TestFolder[];
}
export interface TestFile extends TestResult {
    name: string;
    functions: TestFunction[];
    suites: TestSuite[];
    rawName: string;
    xmlName: string;
    status?: TestStatus;
}
export interface TestSuite extends TestResult {
    name: string;
    functions: TestFunction[];
    suites: TestSuite[];
    isUnitTest: Boolean;
    isInstance: Boolean;
    rawName: string;
    xmlName: string;
    status?: TestStatus;
}
export interface TestFunction extends TestResult {
    name: string;
    rawName: string;
    status?: TestStatus;
}
export interface TestResult extends Node {
    passed?: boolean;
    time: number;
    line?: number;
    message?: string;
    traceback?: string;
    functionsPassed?: number;
    functionsFailed?: number;
    functionsDidNotRun?: number;
}
export interface Node {
    expanded?: Boolean;
}
export interface FlattenedTestFunction {
    testFunction: TestFunction;
    parentTestSuite?: TestSuite;
    parentTestFile: TestFile;
    xmlClassName: string;
}
export interface FlattenedTestSuite {
    testSuite: TestSuite;
    parentTestSuite?: TestSuite;
    parentTestFile: TestFile;
    xmlClassName: string;
}
export interface Tests {
    testFiles: TestFile[];
    testFunctions: FlattenedTestFunction[];
    testSuits: FlattenedTestSuite[];
    testFolders: TestFolder[];
    rootTestFolders: TestFolder[];
}
export enum TestStatus {
    Unknown,
    Discovering,
    Idle,
    Running,
    Error
}
export interface TestsToRun {
    testFolder?: TestFolder[];
    testFile?: TestFile[];
    testSuite?: TestSuite[];
    testFunction?: TestFunction[]
}
