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
const NetXHR      = require("sdk/net/xhr");

const {Cu}        = require('chrome');
const {Services}  = Cu.import('resource://gre/modules/Services.jsm');

const API_URL_WORDNIK    = "http://api.wordnik.com:80/v4/word.json/";
const API_KEY_WORDNIK    = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5";
const API_URL_WIKIMEDIA  = "https://commons.wikimedia.org/w/api.php?";
const API_URL_WIKIPEDIA  = "https://{LANGUAGECODE}.wikipedia.org/w/api.php?";
const API_URL_WIKTIONARY = "https://{LANGUAGECODE}.wiktionary.org/w/api.php?";

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

function getWordnikURL(word, path, parameters) {
    var url = "";
    url += API_URL_WORDNIK+word+path;
    url += "?"+parameters.join("&");
    url += "&api_key="+API_KEY_WORDNIK;
    return url;
}

function getWikiURL(URL, wiktionaryLanguageCode, parameters) {
    var url="";
    url += URL.replace(/{LANGUAGECODE}/, wiktionaryLanguageCode);
    url += parameters.join("&");
    return url;
}

function sendXHRrequest(worker, url, commonResourceName, getRequest) {

    var xhr = new NetXHR.XMLHttpRequest();
    xhr.timeout = SimplePrefs.prefs.axonMaximumWaitTime;
    xhr.overrideMimeType("text/plain; charset=x-user-defined");

    xhr.onload = function() {
        if (xhr.status===200) {
            worker.port.emit(getRequest.onComplete, JSON.stringify(xhr.response));
        }
        else {
            worker.port.emit("errorListener", JSON.stringify({
                "error" : "Unhandled exception: "+commonResourceName+" API call "+
                          "returned with HTTP status: "+xhr.status+" "+xhr.statusText+".",
                "title" : "Axon v"+Self.version+" error"
            }));
        }
    }

    xhr.ontimeout = function() {
        worker.port.emit("errorListener", JSON.stringify({
            "error" : "<p>Request for '"+commonResourceName+"' took longer than the maximum of "+(SimplePrefs.prefs.axonMaximumWaitTime/1000)+" seconds."+
                      "</p><p style='margin-top:10px'>Please try again later, or increase preference <i>axonMaximumWaitTime</i> in <a href='http://kb.mozillazine.org/About:config'>about:config</a>.</p>",
            "title" : "Axon v"+Self.version+" error"
        }));
    }

    xhr.open("GET", url, true);
    xhr.responseType = "json";
    xhr.send();
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

        worker.port.on("getConfigurationAndTemplate", function(response) {
            var data = {
                htmlTemplate: Self.data.load("template.html"),
                htmlTemplateCss: Self.data.load("template.css"),
                isRandomExampleEnabled: SimplePrefs.prefs.isRandomExampleEnabled,
                isWikipediaOnlyEnabled: SimplePrefs.prefs.isWikipediaOnlyEnabled,
                // Wikipedia language selection (see package.json; list source: http://meta.wikimedia.org/wiki/List_of_Wikipedias)
                mainWikipediaLanguageCode: SimplePrefs.prefs.mainWikipediaLanguageCode,
                immediateLookupWikipediaLanguageCode: SimplePrefs.prefs.immediateLookupWikipediaLanguageCode,
                hotkey: SimplePrefs.prefs.hotkey
            };
            worker.port.emit(response.onComplete, data);
        });

        // Receive HTTP GET requests from contentScriptFile
        worker.port.on("sendGetRequest", function(getRequest) {

            var searchKeyword = getRequest.keyword;
            var commonResourceName = "";
            var url = "";

            switch(getRequest.type) {

                case "wordnikDefinitions":
                    commonResourceName = "Wordnik definition";
                    url = getWordnikURL(searchKeyword, "/definitions",
                            ["limit=1",
                             "includeRelated=true",
                             "useCanonical=true",
                             "includeTags=false"]);
                    break;

                case "wordnikAudio":
                    commonResourceName = "Wordnik audio";
                    url = getWordnikURL(searchKeyword, "/audio",
                            ["useCanonical=true",
                             "limit=50"]);
                    break;

                case "wordnikTopExample"://unused
                    commonResourceName = "Wordnik top example";
                    url = getWordnikURL(searchKeyword, "/topExample",
                            ["useCanonical=true"]);
                    break;

                case "wordnikExamples":
                    commonResourceName = "Wordnik example";
                    url = getWordnikURL(searchKeyword, "/examples",
                            ["includeDuplicates=false",
                             "useCanonical=true",
                             "skip=0",
                             "limit=25"]);
                    break;

                case "wiktionaryAudio":
                    commonResourceName = "Wiktionary pronunciation file request";
                    url = getWikiURL(API_URL_WIKTIONARY, getRequest.languageCode,
                            ["action=query",
                             "prop=images",
                             "format=json",
                             "redirects=",
                             "continue=",
                             "titles="+searchKeyword]);
                    break;

                case "wiktionaryAudioFileURL":
                    commonResourceName = "Wiktionary audio filename";
                    url = getWikiURL(API_URL_WIKIMEDIA, getRequest.languageCode,
                            ["action=query", 
                             "prop=imageinfo", 
                             "iiprop=url", 
                             "format=json", 
                             "continue=", 
                             "titles="+searchKeyword]);
                    break;

                case "wikipediaExtract":
                    commonResourceName = "Wikipedia extract";
                    url = getWikiURL(API_URL_WIKIPEDIA, getRequest.languageCode,
                            ["action=query",
                             "prop=extracts",
                             "format=json",
                             "exchars=2048",
                             "redirects=",
                             "continue=",
                             "titles="+searchKeyword]);
                    break;

                case "wikipediaParsedPageDisplayTitle":
                    commonResourceName = "Wikipedia parsed display title";
                    url = getWikiURL(API_URL_WIKIPEDIA, getRequest.languageCode,
                            ["action=parse",
                             "prop=displaytitle",
                             "format=json",
                             "page="+searchKeyword]);
                    break;

                case "wikipediaSuggestion":
                    commonResourceName = "Wikipedia suggestion";
                    url = getWikiURL(API_URL_WIKIPEDIA, getRequest.languageCode, 
                            ["action=query",
                             "srnamespace=0",
                             "srprop=sectiontitle",
                             "list=search",
                             "format=json",
                             "srlimit=1",
                             "continue=",
                             "srsearch="+searchKeyword]);
                    break;

                default:
                    worker.port.emit("errorListener", getErrorAsJsonString("getRequest type "+getRequest.type+" not found."));
                    break;
            }

            sendXHRrequest(worker, url, commonResourceName, getRequest);

        });
   }
});
