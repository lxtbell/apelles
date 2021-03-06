var _ = require('lodash');

// O(n) intersection based on map keys instead of equality
var intersection = function (mapA, mapB) {
    return _.pickBy(mapA, function (value, key) { return key in mapB; });
};

var intersectionAll = function (maps) {
    return _.reduce(maps, intersection);
};

var mapKeysValues = function (array, keyValue) {
    return _.fromPairs(_.map(array, keyValue));
};

// Find the starting position of tokens in the text
var findTokenOffsets = function (text, tokens) {
    var currentOffset = 0;
    return _.map(tokens, function (token) {
        var offset = text.indexOf(token, currentOffset);
        if (offset >= 0) {
            currentOffset = offset + token.length;
        }
        return { token: token, offset: offset };
    });
};

// Destructive
// Modify a set of views, removing common elements
var compareViews = function (viewsWithContext) {
    // Assumes that the text is the same across views
    var baselineText = _.head(viewsWithContext).text;

    // Generate token key strings for fast equivalence comparison
    // Two tokens are equivalent if they have the same length and offset in the text
    var tokenKey = function (tokenWithOffset) {
        return tokenWithOffset.offset + "+" + tokenWithOffset.token.length;
    };

    // Generate constituent key strings for fast equivalence comparison
    // Two constituents are equivalent if they have the same label and their covered tokens are equivalent
    var constituentKey = function (constituent, tokenKeys) {
        return _.escape(constituent.label) + "<" + _.join(_.slice(tokenKeys, constituent.start, constituent.end), ",");
    };

    // Generate relation key strings for fast equivalence comparison
    // Two relations are equivalent if they have the same relationName and their src and target constituents are equivalent
    var relationKey = function (relation) {
        return relation.srcConstituentKey + ">" + _.escape(relation.value.relationName) + ">" + relation.targetConstituentKey;
    };

    // Convert the views into objects of view, a dictionary of constituents with keys, and a dictionary of relations with keys
    var viewConstituentRelationsArray = _.map(viewsWithContext, function (viewWithContext) {
        // Convert constituents into their keys
        var tokenKeys = _.map(findTokenOffsets(baselineText, viewWithContext.tokens || []), tokenKey);

        // Convert constituents into objects of constituent and its key
        var constituentArray = _.map(viewWithContext.view.constituents || [], function (constituent, index) {
            return { key: constituentKey(constituent, tokenKeys), value: constituent };
        });

        // Convert relations into objects of relation and its constituent keys
        var relationArray = _.map(viewWithContext.view.relations || [], function (relation) {
            return {
                srcConstituentKey: constituentArray[relation.srcConstituent].key,
                targetConstituentKey: constituentArray[relation.targetConstituent].key,
                value: relation
            };
        });

        // Convert objects into a dictionary based on keys
        var constituentSet = _.mapKeys(constituentArray, _.property('key'));
        var relationSet = _.mapKeys(relationArray, relationKey);

        return { view: viewWithContext.view, constituents: constituentSet, relations: relationSet };
    });

    // Find common constituents and relations across all views based on equivalence of their keys
    var duplicateConstituents = intersectionAll(_.map(viewConstituentRelationsArray, _.property('constituents')));
    var duplicateRelations = intersectionAll(_.map(viewConstituentRelationsArray, _.property('relations')));

    _.forEach(viewConstituentRelationsArray, function (viewConstituentRelations) {
        var view = viewConstituentRelations.view, constituents = viewConstituentRelations.constituents, relations = viewConstituentRelations.relations;

        // A relation is selected if it is not in all versions
        var selectedRelations = _.filter(relations, function (relation, key) {
            return !(key in duplicateRelations);
        });

        // Find all constituents referenced by a selected relation
        var referencedConstituents = new Set(_.flatMap(selectedRelations, function (relation) {
            return [relation.srcConstituentKey, relation.targetConstituentKey];
        }));

        // A constituent is selected if it is not in all versions or it is referenced by a selected relation
        var selectedConstituents = _.filter(constituents, function (constituent) {
            return !(constituent.key in duplicateConstituents) || referencedConstituents.has(constituent.key);
        });

        // Update constituent ids in relations as some constituents are removed
        var constituentMapping = mapKeysValues(selectedConstituents, function (constituent, newIndex) {
            return [constituent.key, newIndex];
        });
        _.forEach(selectedRelations, function (relation) {
            relation.value.srcConstituent = constituentMapping[relation.srcConstituentKey];
            relation.value.targetConstituent = constituentMapping[relation.targetConstituentKey];
        });

        view.relations = _.map(selectedRelations, _.property('value'));
        view.constituents = _.map(selectedConstituents, _.property('value'));
    });
};

// Destructive
// Modify an array of fetchedData, removing common elements from the views specified in viewInfos
// Returns objects of viewInfo, its matching views, and their containing fetchedData
var compareJsonData = function (fetchedDataArray, viewInfos) {
    return _.map(viewInfos, function (viewInfo) {
        // Find all views that matches viewInfo
        var viewsWithContext = _.flatMap(fetchedDataArray, function (fetchedData) {
            // Make sure fetchedData matches viewInfo.file
            return fetchedData.file !== viewInfo.file ? [] :
                _.flatMap(fetchedData.jsonData.views, function (viewEntry) {
                    // Make sure view matches viewInfo.name and viewInfo.type
                    return viewEntry.viewName !== viewInfo.name ? [] :
                        _.map(_.filter(viewEntry.viewData, function (viewDatum) {
                            return viewDatum.viewType === viewInfo.type;
                        }), function (view) {
                            return {
                                data: fetchedData,
                                view: view,
                                text: fetchedData.jsonData.text,
                                tokens: fetchedData.jsonData.tokens
                            };
                        });
                });
        });

        // Perform comparison
        if (viewsWithContext.length >= 2) {
            compareViews(viewsWithContext);
        }

        return { viewInfo: viewInfo, views: _.map(viewsWithContext, 'view'), data: _.map(viewsWithContext, 'data') };
    });
};

module.exports = {
    compareViews: compareViews,
    compareJsonData: compareJsonData
};
