"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const ChildProcess = require("child_process");
const cheerio = require("cheerio");
const minimatch = require("minimatch");
class Annotation {
    constructor(sourcePath, lineNumber, score, scoreColorCode, generatedCode) {
        this.sourcePath = sourcePath;
        this.lineNumber = lineNumber;
        this.score = score;
        this.scoreColorCode = scoreColorCode;
        this.generatedCode = generatedCode;
    }
    createGeneratedCodeMarkdown() {
        if (this.generatedCode === null) {
            return null;
        }
        return new vscode.MarkdownString("```c\n" + this.generatedCode + "\n```");
    }
}
exports.Annotation = Annotation;
class CythonExecutor {
    constructor(condaEnv) {
        this.condaEnv = condaEnv;
    }
    run(args) {
        let cythonCmd;
        if (this.condaEnv) {
            let condaCmd;
            switch (os.platform()) {
                case 'darwin': /* falls through */
                case 'linux':
                    condaCmd = `. activate ${this.condaEnv}`;
                    break;
                case "win32":
                    condaCmd = `activate ${this.condaEnv}`;
                    break;
                default:
                    throw Error(`Unsupported operating system: ${os.platform()}`);
            }
            cythonCmd = `${condaCmd} && cython -a ${args.join(' ')}`;
        }
        else {
            cythonCmd = `cython -a ${args.join(' ')}`;
        }
        ChildProcess.execFileSync('/bin/bash', ['-c', cythonCmd]);
    }
}
class AnnotationProvider {
    constructor(cython, cppPaths) {
        this.cython = cython;
        this.cppPathMatchers = cppPaths.map((path) => { return new minimatch.Minimatch(path); });
    }
    executeCythonAnnotate(sourcePath, isCpp) {
        const environment = 'quiver';
        let args = ['-a', sourcePath];
        if (isCpp) {
            args.unshift('--cplus');
        }
        this.cython.run(args);
        const annotationHtmlPath = path.join(path.dirname(sourcePath), path.basename(sourcePath, path.extname(sourcePath)) + '.html');
        return annotationHtmlPath;
    }
    scoreFromClass(class_id) {
        return Number(class_id.slice('score-'.length));
    }
    parseScoreClassColorsCodes($) {
        const result = {};
        const styleElementLines = $('style').text().split('\n');
        for (let line of styleElementLines) {
            if (!line.trimLeft().startsWith('.cython.score-')) {
                continue;
            }
            // Should look like ".cython.score-0 {background-color: #FFFFff;}"
            const tokens = line.trimLeft().split(' ');
            const score = this.scoreFromClass(tokens[0].slice('.cython.'.length));
            const colorCode = tokens[2].slice(1, 9);
            result[score] = colorCode;
        }
        return result;
    }
    parseAnnotationsHtml(sourcePath, annotationHtmlPath) {
        const result = [];
        const data = fs.readFileSync(annotationHtmlPath);
        const $ = cheerio.load(data.toString('utf8'));
        const colorCodes = this.parseScoreClassColorsCodes($);
        $('.line').each((i, elem) => {
            let lineNumberStr = $('span[class=""]', elem).text();
            let lineNumber = Number(lineNumberStr);
            if (lineNumber !== i + 1) {
                throw Error(`Error parsing line number in element: ${elem}`);
            }
            let elemClasses = elem.attribs['class'].split(' ');
            // Always the last one
            let scoreClass = elemClasses[elemClasses.length - 1];
            let lineScore = this.scoreFromClass(scoreClass);
            let code = null;
            if ($(elem).attr('onclick')) {
                code = $(elem).next('.code').text();
            }
            result.push(new Annotation(sourcePath, lineNumber, lineScore, colorCodes[lineScore], code));
        });
        return result;
    }
    isCppPath(path) {
        for (let matcher of this.cppPathMatchers) {
            if (matcher.match(path)) {
                return true;
            }
        }
        return false;
    }
    annotate(sourcePath) {
        let annotationsHtmlPath = this.executeCythonAnnotate(sourcePath, this.isCppPath(sourcePath));
        return this.parseAnnotationsHtml(sourcePath, annotationsHtmlPath);
    }
}
exports.AnnotationProvider = AnnotationProvider;
function buildAnnotationProvider(configuration) {
    let cppPaths = configuration.get('cppPaths', []);
    const executor = new CythonExecutor(configuration.get('condaEnv'));
    return new AnnotationProvider(executor, cppPaths);
}
exports.buildAnnotationProvider = buildAnnotationProvider;
//# sourceMappingURL=annotator.js.map