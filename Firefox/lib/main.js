/*******************************************************************************
 * Copyright (c) 2015 Ivo van Kamp
 *
 * This file is part of Axon.
 *
 * Axon is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Axon is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *******************************************************************************/

"use strict";

const Request     = require("sdk/request");
const PageMod     = require("sdk/page-mod");
const Self        = require("sdk/self");
const Buttons     = require("sdk/ui/button/action");
const Tabs        = require("sdk/tabs");
const Panel       = require("sdk/panel");
const SimplePrefs = require("sdk/simple-prefs");

const {Cu}        = require('chrome');
const {Services}  = Cu.import('resource://gre/modules/Services.jsm');

const wordnikAPIBaseURL    = "http://api.wordnik.com:80/v4/word.json/";
const wikipediaAPIBaseURL  = "https://{LANGUAGECODE}.wikipedia.org/w/api.php?";
const wiktionaryAPIBaseURL = "https://{LANGUAGECODE}.wiktionary.org/w/api.php?";
const wordnikAPIKey        = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5";
const wikimediaAPIBaseURL  = "https://commons.wikimedia.org/w/api.php?";

var button = Buttons.ActionButton({
    id: "mozilla-link",
    label: "Visit Mozilla",
    icon: {
        "16": "./Images/icon-16.png",
        "32": "./Images/icon-32.png",
        "64": "./Images/icon-64.png"
    },
    onClick: function() {
        Services.wm.getMostRecentWindow('navigator:browser').BrowserOpenAddonsMgr('addons://detail/jid1-xJdHsGBXo4PEKA%40jetpack/preferences');
    }
});

function getWordnikURL(word, parameters) {
    var url = "";
    url += wordnikAPIBaseURL+word;
    url += parameters;
    url += "&api_key="+wordnikAPIKey;
    return url;
}

function getWikipediaURL(wikipediaLanguageCode, word, parameters) {
    var url = "";
    url += wikipediaAPIBaseURL.replace(/{LANGUAGECODE}/, wikipediaLanguageCode);
    url += parameters;
    url += "&titles="+word;
    return url;
}

function getWiktionaryURL(wiktionaryLanguageCode, word, parameters) {
    var url="";
    url += wiktionaryAPIBaseURL.replace(/{LANGUAGECODE}/, wiktionaryLanguageCode);
    url += parameters;
    url += "&titles="+word;
    return url;
}

function getWikipediaSuggestionURL(wikipediaLanguageCode, word, parameters) {
    var url = "";
    url += wikipediaAPIBaseURL.replace(/{LANGUAGECODE}/, wikipediaLanguageCode);
    url += parameters;
    url += "&srsearch="+word;
    return url;
}

function getWikimediaURL(fileName, parameters) {
    var url="";
    url += wikimediaAPIBaseURL;
    url += parameters;
    url += "&titles="+fileName;
    return url;
}

// Only need to attach listeners.js when Firefox starts with tabs
// from last time because PageMod contentScriptFile sometimes doesn't get
// executed in this case (Firefox 35.0). PageMod does attach the worker.
exports.main = function (options, callbacks) {
    if (options.loadReason==="startup") {
        for (let tab of Tabs) {
            tab.attach({
                contentScriptFile: Self.data.url("listeners.js")
            });
        }
    }
};

PageMod.PageMod({

   include: "*",
   contentScriptFile: Self.data.url("listeners.js"),
   contentScriptWhen: "start",
   attachTo: ["top", "frame", "existing"],
   onAttach: function(worker) {

        worker.port.on("getConfigAndTemplate", function(response) {
            var data = {
                htmlTemplate: Self.data.load("template.html"),
                htmlTemplateCss: Self.data.load("template.css"),
                isRandomExampleEnabled: SimplePrefs.prefs.isRandomExampleEnabled,
                isWikipediaOnlyEnabled: SimplePrefs.prefs.isWikipediaOnlyEnabled,
                // Wikipedia language selection (see package.json; list source: http://meta.wikimedia.org/wiki/List_of_Wikipedias)
                mainWikipediaLanguageCode: SimplePrefs.prefs.mainWikipediaLanguageCode,
                immediateLookupWikipediaLanguageCode: SimplePrefs.prefs.immediateLookupWikipediaLanguageCode
            };
            worker.port.emit(response.onComplete, data);
        });

        // Receive HTTP GET requests from contentScriptFile
        worker.port.on("sendGetRequest", function(response) {

            var url = "";
            var searchKeyword = response.keyword;

            switch(response.type) {
                case "wordnikDefinitions":
                    url = getWordnikURL(searchKeyword, "/definitions?limit=1&includeRelated=true&useCanonical=true&includeTags=false");
                    break;
                case "wordnikAudio":
                    url = getWordnikURL(searchKeyword, "/audio?useCanonical=true&limit=50");
                    break;
                case "wordnikTopExample"://unused
                    url = getWordnikURL(searchKeyword, "/topExample?useCanonical=true");
                    break;
                case "wordnikExamples":
                    url = getWordnikURL(searchKeyword, "/examples?includeDuplicates=false&useCanonical=true&skip=0&limit=25");
                    break;
                case "wiktionaryAudio":
                    url = getWiktionaryURL(response.languageCode, searchKeyword, "action=query&prop=images&format=json&redirects=&continue=");
                    break;
                case "wiktionaryAudioFileURL":
                    url = getWikimediaURL(searchKeyword, "action=query&prop=imageinfo&iiprop=url&format=json&continue=");
                    break;
                case "wikipediaExtract":
                    url = getWikipediaURL(response.languageCode, searchKeyword, "action=query&prop=extracts&format=json&exchars=350&redirects=&continue=");
                    break;
                case "wikipediaSuggestion":
                    url = getWikipediaSuggestionURL(response.languageCode, searchKeyword, "action=query&srnamespace=0&srprop=sectiontitle&list=search&format=json&srlimit=1&continue=");
                    break;
                default:
                    var version = Self.version;
                    worker.port.emit("errorListener", JSON.stringify({"error":"Axon v"+version+" Firefox add-on error: Request type "+response.type+" not found."}));
                    break;
            }

            Request.Request({
                url: url,
                onComplete: function(data) {
                    worker.port.emit(response.onComplete, JSON.stringify(data.json));
                }
            }).get();
        });
   }
});

