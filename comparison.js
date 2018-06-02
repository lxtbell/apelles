const path = require('path');
var fs = require('fs');
var browserify = require('browserify-middleware');
var express = require('express');
var minimist = require('minimist');
var _ = require('lodash');
var read = require('fs-readdir-recursive');


var argv = minimist(process.argv.slice(2), { boolean: ['r', 'f'] });
var serverPort = argv['p'] || argv['port'] || 8080;
var recursiveList = argv['r'];
var filterJson = argv['f'];
var annotationFolders = argv['_'];
if (annotationFolders.length == 0) {
    annotationFolders = [__dirname + '/public/comparison/prediction', __dirname + '/public/comparison/gold'];
}
annotationFolders = _.map(annotationFolders, function (folder) {
    return path.resolve(folder);
});


// Retrieve file list for every request might be slow, while allowing adding new files without restarting the server
function listAvailableAnnotations() {
    return Promise.all(_.map(annotationFolders, function (folder) {
        return new Promise(function (resolve, reject) {
            if (recursiveList) {
                resolve(read(folder));
            }
            else {
                fs.readdir(folder, function (err, files) {
                    if (!err) {
                        resolve(files);
                    }
                    else {
                        reject('Unable to read folder. ' + err);
                    }
                });
            }
        });
    })).then(function (results) {
        var commonFiles = _.intersection.apply(_, results);
        if (filterJson) {
            commonFiles = _.filter(commonFiles, function (file) {
                return _.endsWith(file, ".json");
            });
        }
        return commonFiles;
    });
}


function getAvailableAnnotations(req, res) {
    listAvailableAnnotations().then(function (results) {
        res.json(results);
    }).catch(function (err) {
        console.log(err);
        res.status(500).json([]);
    });
}

function trimView(view, tokenEnd) {
    var keepConstituent = function (constituent) {
        return constituent.end <= tokenEnd;
    };
    _.forEach(view.viewData, function (viewData) {
        viewData.relations = _.filter(viewData.relations, function (relation) {
            return keepConstituent(viewData.constituents[relation.srcConstituent]) && keepConstituent(viewData.constituents[relation.targetConstituent]);
        });
        viewData.constituents = _.filter(viewData.constituents, keepConstituent);
    });
}

function trimData(jsonData, sentenceEnd) {
    var sentenceEndPositions = jsonData.sentences.sentenceEndPositions;
    var newSentenceEndPositions = _.slice(sentenceEndPositions, 0, sentenceEnd >= 0 ? sentenceEnd : sentenceEndPositions.length);
    var tokenEnd = _.last(newSentenceEndPositions) || 0;

    _.forEach(jsonData.views, function (view) {
        trimView(view, tokenEnd);
    });
    jsonData.sentences.sentenceEndPositions = newSentenceEndPositions;
    jsonData.tokenOffsets = _.slice(jsonData.tokenOffsets, 0, tokenEnd);
    jsonData.tokens = _.slice(jsonData.tokens, 0, tokenEnd);
}


function getAnnotation(req, res) {
    listAvailableAnnotations().then(function (results) {
        var files = req.query.annotations;
        var sentenceEnd = req.query.sentenceEnd || -1;
        if (!Array.isArray(files) || _.difference(files, results).length) {
            // Bad file access!
            console.log('Denied file access: ' + JSON.stringify(files));
            res.status(400).json([]);
            return;
        }

        return Promise.all(_.map(annotationFolders, function (folder) {
            return Promise.all(_.map(files, function (file) {
                return new Promise(function (resolve, reject) {
                    var fullPath = path.join(folder, file);
                    fs.readFile(fullPath, "utf8", function (err, data) {
                        if (!err) {
                            try {
                                var jsonData = JSON.parse(data);
                                trimData(jsonData, sentenceEnd);
                                resolve({folder: folder, file: file, jsonData: jsonData});
                            } catch (err) {
                                reject('Unable to parse file: ' + fullPath + '\n' + err);
                            }
                        }
                        else {
                            reject('Unable to read file: ' + fullPath + '\n' + err);
                        }
                    })
                });
            }));
        })).then(function (dataList) {
            res.json({ folders: annotationFolders, data: _.flatten(dataList) });
        });
    }).catch(function (err) {
        console.log(err);
        res.status(500).json([]);
    });
}


var app = express();
app.get('/', function (req, res) { res.sendFile(__dirname + '/public/comparison.html') });
app.get('/apelles.js', browserify(__dirname + '/index.js', { standalone: 'apelles' }));
app.get('/list', getAvailableAnnotations);
app.get('/get', getAnnotation);
app.use(express.static(__dirname + '/public'));
app.listen(serverPort);

console.log('Listening at http://localhost:' + serverPort);
console.log('Folders served: ');
_.forEach(annotationFolders, function (folder) {
    console.log(folder);
});
