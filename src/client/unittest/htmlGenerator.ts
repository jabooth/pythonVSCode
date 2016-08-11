import {Tests, TestFile, TestSuite, TestFunction, TestStatus, TestFolder} from './contracts';

export function generateErrorView(message: string, error: String | Error): string {
    let errorDetails = '';
    if (error && typeof error === 'object') {
        let ex = error as Error;
        errorDetails = `${ex.message}\n${ex.stack}`;
    }
    if (typeof error === 'string') {
        errorDetails = error + '';
    }
    return `
            <style>
                .message, .details {
                    color:red;
                }
                .message {
                    font-weight:bold;
                }
            </style>
            <body>
                <div class="message">${message}</div><br/>
                <div class="details">${errorDetails}</details>
            </body>`;

}

export function generateTestExplorerHtmlViewFiles(tests: TestFile[], currentStatus: TestStatus): string {
    let htmlForAllTestFiles = tests.reduce((html, testFile) => html + generateHtmlForTestFileSuite(testFile), '');
    return `
        <div>
            <ol class="ts-tree " id="">
                ${htmlForAllTestFiles}
            </ol>
        </div>
        `;
}
export function generateTestExplorerHtmlView(testFolders: TestFolder[], currentStatus: TestStatus): string {
    let htmlForAllTestFolders = testFolders.reduce((html, testFolder) => html + generateHtmlForTestFolder(testFolder), '');
    return `
            <div class="treeview hover">
                <ul>
                    ${htmlForAllTestFolders}
                </ul>
            </div>
        `;
}

export function generateDiscoveringHtmlView(): string {
    return `
        <div class ="container">
            <div>Discovering Unit Tests</div>
            <div class="spinner">
                <div class="rect1"></div>
                <div class="rect2"></div>
                <div class="rect3"></div>
                <div class="rect4"></div>
                <div class="rect5"></div>
            </div>
        </div>
        `;
}

export function generateRunningTestsHtmlView(): string {
    return `
        <div class ="container">
            <div>Running Unit Test(s)</div>
            <div class="spinner">
                <div class="rect1"></div>
                <div class="rect2"></div>
                <div class="rect3"></div>
                <div class="rect4"></div>
                <div class="rect5"></div>
            </div>
        </div>
        `;
}

function generateMenuItem(label: string, command: string, leftPos: number): string {
    return `
            <div style="position:relative" class="menuItem">
                <a style="left:${leftPos}em;" href="${encodeURI('command:' + command)}">${label}</a>
                <label style="left:${leftPos}em;">${label}</label>
            </div>
            `;
}

export function generateHtmlForMenu(currentStatus: TestStatus, tests: Tests): string {
    const menuItems = [];
    let leftPos = 0;

    menuItems.push(generateMenuItem('Re-discover Unit Tests', 'python.discoverUnitTests', leftPos));
    menuItems.push(generateMenuItem('Run All Unit Tests', 'python.runAllUnitTests', leftPos = leftPos + 13));

    const someUnitTestsDidNotRun = tests.testFunctions.some(fn => typeof fn.testFunction.passed !== 'boolean');
    const someUnitTestsDidRun = tests.testFunctions.some(fn => typeof fn.testFunction.passed === 'boolean');
    const someUnitTestsDidFail = tests.testFunctions.some(fn => fn.testFunction.passed === false);
    const someUnitTestsDidPass = tests.testFunctions.some(fn => fn.testFunction.passed === true);

    // if (someUnitTestsDidFail) {
    //     menuItems.push(generateMenuItem('Run Failed Tests', 'python.runFailedTests', leftPos = leftPos + 10));
    // }
    if (someUnitTestsDidFail || someUnitTestsDidPass) {
        menuItems.push(generateMenuItem('Run previous Tests', 'python.runPreviousTests', leftPos = leftPos + 10));
    }

    return `
        <div class="menuContainer">
            ${menuItems.join('\n')}
        </div>
        <hr />
    `;
}

function generateHtmlForTestFileSuite(testFileSuite: TestSuite | TestFile): string {
    let functionHtml = testFileSuite.functions.reduce((html, fn) => html + generateHtmlForTestFunction(fn), '');
    let childTestHtml = testFileSuite.suites.reduce((html, fn) => html + generateHtmlForTestFileSuite(fn), '');
    let testType = '';
    let iconClass = '';

    // The property isInstance only exists on the TestSuite class and not TestFile
    if (typeof (testFileSuite as any).isUnitTest === 'boolean') {
        testType = 'suite';
        iconClass = 'class';
    }
    else {
        testType = 'file'
        iconClass = 'fa fa-file-o';
    }

    let childrenHtml = '';
    if ((functionHtml.length + childTestHtml.length) > 0) {
        childrenHtml = `
                        <ul>
                            ${functionHtml}
                            ${childTestHtml}
                        </ul>
                        `;
    }

    let counters = '';
    //     <span class="success">10</span>
    // <span class="fail">25</span>
    // <span class="unknown">100</span>        
    if (testFileSuite.functionsPassed > 0) {
        counters += `<span class="success">${testFileSuite.functionsPassed}</span>`
    }
    if (testFileSuite.functionsFailed > 0) {
        counters += `<span class="fail">${testFileSuite.functionsFailed}</span>`
    }

    return `
        <li>
          <input type="checkbox" id="${encodeURIComponent(testFileSuite.rawName)}">
          <label for="${encodeURIComponent(testFileSuite.rawName)}" class="icon ${iconClass}"></label>
          <label>
            <span class="contextMenuItem" title="${testFileSuite.message ? testFileSuite.message : ''}">${testFileSuite.name}</span>
            ${counters}
            <span class="dropdown">
                <span>&nbsp;[Test]</span>
                <div class="dropdown-content">
                    <a href="${encodeURI('command:python.runUnitTest?' + JSON.stringify([testType, testFileSuite.rawName]))}">Run this test</a>
                </div>
            </span>
          </label>
          ${childrenHtml}
        </li>
    `;
}
function generateHtmlForTestFolder(testFolder: TestFolder): string {
    let testFilesHtml = testFolder.testFiles.reduce((html, fl) => {
        return html + generateHtmlForTestFileSuite(fl);
    }, '');
    let childFoldersHtml = testFolder.folders.reduce((html, folder) => {
        return html + generateHtmlForTestFolder(folder);
    }, '');

    let iconClass = '';
    if (testFolder.passed === true) {
        iconClass = 'success';
    }
    if (testFolder.passed === false) {
        iconClass = 'fail';
    }

    // Don't display the folder name if the folder name = '.' (meaning it is the root directory)
    if (testFolder.name === '.' || testFolder.name === '') {
        return `
                    ${childFoldersHtml}
                    ${testFilesHtml}
                `;
    }

    let childrenHtml = '';
    if ((childFoldersHtml.length + testFilesHtml.length) > 0) {
        childrenHtml = `
                        <ul>
                            ${childFoldersHtml}
                            ${testFilesHtml}
                        </ul>
                        `;
    }

    let id = encodeURIComponent(testFolder.name);
    let counters = '';
    //     <span class="success">10</span>
    // <span class="fail">25</span>
    // <span class="unknown">100</span>        
    if (testFolder.functionsPassed > 0) {
        counters += `<span class="success">${testFolder.functionsPassed}</span>`
    }
    if (testFolder.functionsFailed > 0) {
        counters += `<span class="fail">${testFolder.functionsFailed}</span>`
    }

    return `
        <li>
            <input type="checkbox" id="${id}" >
            <label title="epand" for="${id}" class="icon folder open fa fa-folder-o" aria-hidden="true"></label>
            <label title="collapse" for="${id}" class="icon folder open fa fa-folder-open-o" aria-hidden="true"></label>      
            <label>
                <span class="contextMenuItem" id="1">${testFolder.name}</span>
                ${counters}
                <span class="dropdown">
                    <span>&nbsp;[Test]</span>
                    <div class="dropdown-content">
                        <a href="${encodeURI('command:python.runUnitTest?' + JSON.stringify(['folder', testFolder.rawName]))}">Run tests under this</a>
                    </div>
                </span>
            </label>
            ${childrenHtml}
        </li>
        `;
}
 
function generateHtmlForTestFunction(testFunction: TestFunction): string {
    // <li class="ts-file "><a class="added-async-link another-class" id="file3" title="this is a file link" href="#mainlink">File Main 3</a></li>
    let iconClass = '';
    let counters = '';
    if (testFunction.passed === true) {
        iconClass = 'success';
        counters += '<span class="icon success"></span>';
    }
    if (testFunction.passed === false) {
        iconClass = 'fail';
        counters += '<span class="icon fail"></span>';
    }

    //     <span class="success">10</span>
    // <span class="fail">25</span>
    // <span class="unknown">100</span>        

    return `
        <li>
          <label>
            <span class="contextMenuItem" title="${testFunction.message ? testFunction.message : ''}"  id="${encodeURIComponent(testFunction.rawName)}">${testFunction.name}</span>
            ${counters}
            <span class="dropdown">
                <span>[Test]</span>
                <div class="dropdown-content">
                    <a href="${encodeURI('command:python.runUnitTest?' + JSON.stringify(['function', testFunction.rawName]))}">Run this test</a>
                </div>
            </span>
          </label>          
        </li>    
        `;
}

export const COMMON_STYLES = `
    <style>
        /* http://meyerweb.com/eric/tools/css/reset/ 
           v2.0 | 20110126
           License: none (public domain)
        */

        html, body, div, span, applet, object, iframe,
        h1, h2, h3, h4, h5, h6, p, blockquote, pre,
        a, abbr, acronym, address, big, cite, code,
        del, dfn, em, img, ins, kbd, q, s, samp,
        small, strike, strong, sub, sup, tt, var,
        b, u, i, center,
        dl, dt, dd, ol, ul, li,
        fieldset, form, label, legend,
        table, caption, tbody, tfoot, thead, tr, th, td,
        article, aside, canvas, details, embed, 
        figure, figcaption, footer, header, hgroup, 
        menu, nav, output, ruby, section, summary,
        time, mark, audio, video {
          margin: 0;
          padding: 0;
          border: 0;
          font-size: 100%;
          font: inherit;
          vertical-align: baseline;
        }
        /* HTML5 display-role reset for older browsers */
        article, aside, details, figcaption, figure, 
        footer, header, hgroup, menu, nav, section {
          display: block;
        }
        body {
          line-height: 1;
        }
        ol, ul {
          list-style: none;
        }
        blockquote, q {
          quotes: none;
        }
        blockquote:before, blockquote:after,
        q:before, q:after {
          content: '';
          content: none;
        }
        table {
          border-collapse: collapse;
          border-spacing: 0;
        }

        body {
            margin:0 1em;
        }
    </style>
`;

export const MENU_STYLES = `
    <style>
        div.menuContainer, div.menuItem {
            position:relative;
        }
        div.menuContainer {
            display:block;
            height:1.5em;
            margin-top:0.5em;
        }
        div.menuItem a {
            position:absolute;
            top:0;
            color:transparent;
            z-index:9
        }
        div.menuItem a:hover ~ label {
            font-weight:bold;
        }
        div.menuItem label {
            position:absolute;
            top:0;
        }
    </style>
`;

export const DISCOVER_STYLES = `
    <style>
    .container {
        margin: 100px auto;
        height: 40px;
        text-align: center;
        font-size:1.5em;
    }
    .spinner {
        margin: 0px auto;
        width: 50px;
        height: 40px;
        text-align: center;
        font-size: 10px;
    }

    .spinner > div {
        background-color: #333;
        height: 100%;
        width: 6px;
        display: inline-block;

        -webkit-animation: sk-stretchdelay 1.2s infinite ease-in-out;
        animation: sk-stretchdelay 1.2s infinite ease-in-out;
    }

    .spinner .rect2 {
        -webkit-animation-delay: -1.1s;
        animation-delay: -1.1s;
    }

    .spinner .rect3 {
        -webkit-animation-delay: -1.0s;
        animation-delay: -1.0s;
    }

    .spinner .rect4 {
        -webkit-animation-delay: -0.9s;
        animation-delay: -0.9s;
    }

    .spinner .rect5 {
        -webkit-animation-delay: -0.8s;
        animation-delay: -0.8s;
    }

    @-webkit-keyframes sk-stretchdelay {
        0%, 40%, 100% { -webkit-transform: scaleY(0.4) }
        20% { -webkit-transform: scaleY(1.0) }
    }

    @keyframes sk-stretchdelay {
        0%, 40%, 100% {
            transform: scaleY(0.4);
            -webkit-transform: scaleY(0.4);
        }  20% {
            transform: scaleY(1.0);
            -webkit-transform: scaleY(1.0);
        }
    }
    </style>
`;


const PYTHON_IMAGE_URL = `url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QAAAAAAAD5Q7t/AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAB3RJTUUH4AgFAg4GqVpWBAAAAy9JREFUWMPt10toHlUUB/DfzPc1SVMroQlVY/AZpFJqRbGVasFlfGG7UBR3RRca8YEbqahQl7ooboSCbkQQ1BJclUoUX4GgTZWCUtFaRFAk1mg172+ui5k0k/km+QYT0EX/uztz5pz/Ped/z7nDefzHiKoa7nx+YsH+EtyIrbgINfyOb/EFvsf86IGutSOQBe/EQ3gU/VngPBL8jHfxEn6CVkTiisHhMTyHjzGMUOLrUjyOg7igyuZaEsiwAXvwOR7BfkysYH8brqriuF6RQJzZbsX92NZihzWsW0sCMIM+HMoCBMxmgSqLuYimD7Oa19GDthzRm7HJ0tp34glp7fOYuHj9r3cODdx9emZqc10q0HFMQ8euT8ozkFP703gQHbmADc3Cq2VEl6AR4sZdfUe3z093H5KWKsGIVDs/To/sPkeiXggOD+BZtP/btBIlnfXJ9iC63KJWrsQUBqWlQ/Mp6MK+1QUHsxvqk/Ml/vdie/5B0WCLVOmrQhKib67fdKIjhKij8Kobt8L0yO5SAv24cDXBG6F2+pbNo2/3dv6yN4jK+sy1+UXxGHZb/kiFRohPRXwZR8lZhEgIQZQEUYMQ2uK5s/ddNnRycMtre5IQ71rGT7dUvI0yAssh4PAz2145MtA7fF09nt+IOBIiqcKJiCVXB9G9SYivqJqxIoHxLNiSLCQhHju4Y//wjp6xFxqh1rfIKmcWaDTNp1L8trB7mjXwHf4sftFZnzx2U8/x2/PBV4Gv84sigZM4Ucx9e212LhK61iD4OD5lsRsWCUzgdVnLTBGJJUH1ybkSDuOr/INzGhg90LXQDd9Cr8VWHNeixhmistORSC8e0yXvaha1FPAZXsRc3mi5YVSTHpe22WSdff1veviaN97BzoL5FF6WaifO+ZvDGP7IniU4o2QYtRyjWcfaiPdLCCyM5CRbz2RZm8AdOJ4PVobV1jWSzo31OCodZB9Ib1CVfFclkGS7Wwkf4gg+kpZgtpVTqnfCv/Ge9FLStozNoHSYDWRZ+GFNMpCr4at4StonyrLRj3swhCfxVxUCle9ymRgj6c/IDcp/TI7hFBqtxHce/xv8A/Mv5tF2XUuzAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDE2LTA4LTA1VDAyOjE0OjA2LTA0OjAw6aJOXQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAxNi0wOC0wNVQwMjoxNDowNi0wNDowMJj/9uEAAAAASUVORK5CYII=')`;

const FAIL_IMAGE_URL = `url('data:image/png;base64,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')`;

const SUCCESS_IMAGE_URL = `url('data:image/png;base64,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')`;


export const TREE_STYLES = `
    <style>
        .dropdown {
            position: relative;
            display: inline-block;
        }

        .dropdown-content {
            display: none;
            position: absolute;
            background-color: #f9f9f9;
            min-width: 160px;
            box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
            z-index:999;
        }

        .dropdown-content a {
            color: black;
            padding: 12px 16px;
            text-decoration: none;
            display: block;
            white-space:nowrap;
        }

        .dropdown-content a:hover {background-color: #f1f1f1}

        .dropdown:hover .dropdown-content {
            display: block;
        }

        .treeview {
            float: left;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            -o-user-select: none;
            user-select: none;
        }
        .treeview:hover input ~ label.icon,
        .treeview.hover input ~ label.icon {
            opacity: 1.0;
        }
        .treeview ul {
            list-style: none;
            padding-left: 1em;
        }
        .treeview ul li {
            margin:0.5em 0;
        }
        .treeview ul li span {
        }
        .treeview input {
            display: none;
        }
        .treeview input ~ ul {
            display: none;
        }
        .treeview input:checked ~ ul {
            display: inherit;
        }
        .treeview input ~ label.icon {
            cursor: pointer;
        }
        .treeview input ~ label.icon {
            display:block;
            margin-left: -1.2em;
            margin-top: 0em;
            xwidth: 2em;
            height: 1em;
            position: absolute;
        }
        .treeview input ~ label.icon.fa-folder-open-o {
            display:none;
        }
        .treeview input:checked ~ label.icon.fa-folder-o {
            display:none;
        }
        .treeview input:checked ~ label.icon.fa-folder-open-o {
            display:block;
        }
        .treeview span.fail, .treeview span.success, .treeview span.unknown {
            border-radius:1em;
            height:1em;
            padding:0 0.3em;
            display:inline-block;
            text-align:center;
        }
        .treeview span.fail {
            background-color:red;
            color:white;
        }
        .treeview span.success {
            background-color:green;
            color:white;
        }
        .treeview span.unknown {
            background-color:orange;
            color:black;
        }
        
        .treeview label.icon.class {
            display:block;
            height:1em;
            width:1em;
            background: ${PYTHON_IMAGE_URL} 0 0.25em no-repeat;
            background-position:0;
            background-size: 1.2em;
        }

        .treeview span.icon.success {
            height:1em;
            width:1em;
            background: ${SUCCESS_IMAGE_URL} 0 0.25em no-repeat;
            background-position:0;
            background-size: 1.15em;
            font-size: 0.8em;
        }

        .treeview span.icon.fail {
            height:1em;
            width:1em;
            background: ${FAIL_IMAGE_URL} 0 0.25em no-repeat;
            background-position:0;
            background-size: 1.15em;
            font-size: 0.8em;
        }        
    </style>
`;
