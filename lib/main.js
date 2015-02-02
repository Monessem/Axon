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

const wordnikAPIBaseURL   = "http://api.wordnik.com:80/v4/word.json/";
const wikipediaAPIBaseURL = "https://{LANGUAGECODE}.wikipedia.org/w/api.php?";
const wordnikAPIKey       = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5";

var button = Buttons.ActionButton({
    id: "mozilla-link",
    label: "Visit Mozilla",
    icon: {
        "16": "./Images/icon-16.png",
        "32": "./Images/icon-32.png",
        "64": "./Images/icon-64.png"
    },
    onClick: function() {
        Services.wm.getMostRecentWindow('navigator:browser').BrowserOpenAddonsMgr('addons://detail/jid1-pBCQ3G0mXLBZMw%40jetpack/preferences');
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
    url += parameters+word;
    return url;
}

function onTabReady(tab) {
    tab.attach({
        contentScriptFile: [
            Self.data.url("listeners.js")
        ]
    });
    // Only need tab ready when Firefox starts with tabs from last
    // time because PageMod contentScriptFile doesn't get executed in
    // this case. PageMod does attach the worker.
    // Remove the listener, PageMod will take care of new pages.
    Tabs.removeListener("ready", onTabReady);
}

/* On launching Firefox 35.0 PageMod contentScriptFile's aren't loaded
 * when using preference 'Show my windows and tabs from last time'.
 * The Tabs ready event however works just fine.
 */
Tabs.on('ready', onTabReady);

PageMod.PageMod({

   include: "*",
   contentScriptFile: [ /* not executed on browser launch? */
        Self.data.url("listeners.js")
   ],
   contentScriptWhen: "start",
   attachTo: ["top", "frame", "existing"],
   onAttach: function(worker) {

        worker.port.on("getConfigAndTemplate", function(response) {
            var data = {
                htmlTemplate: Self.data.load("template.html"),
                htmlTemplateCss: Self.data.load("template.css"),
                isRandomExampleEnabled: SimplePrefs.prefs.isRandomExampleEnabled,
                isWikipediaOnlyEnabled: SimplePrefs.prefs.isWikipediaOnlyEnabled,
                mainWikipediaLanguageCode: SimplePrefs.prefs.mainWikipediaLanguageCode,
                immediateLookupWikipediaLanguageCode: SimplePrefs.prefs.immediateLookupWikipediaLanguageCode
            };
            worker.port.emit(response.onComplete, data);
        });

        // Receive HTTP GET requests from contentScriptFile
        worker.port.on("sendGetRequest", function(response) {

            var url = "";
            var searchWord = response.word;

            switch(response.type) {
                case "definitions":
                    url = getWordnikURL(searchWord, "/definitions?limit=1&includeRelated=true&useCanonical=true&includeTags=false");
                break;
                case "audio":
                    url = getWordnikURL(searchWord, "/audio?useCanonical=true&limit=50");
                    break;
                case "topExample"://unused
                    url = getWordnikURL(searchWord, "/topExample?useCanonical=true");
                break;
                case "examples":
                    url = getWordnikURL(searchWord, "/examples?includeDuplicates=false&useCanonical=true&skip=0&limit=25");
                break;
                case "wikipediaExtract":
                    url = getWikipediaURL(response.languageCode, searchWord, "action=query&redirects=continue=&prop=extracts&format=json&exchars=350&titles=");
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

