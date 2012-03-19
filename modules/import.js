/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is People.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Jono DiCarlo <jdicarlo@mozilla.com>
 *  Dan Mills <thunder@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */


let EXPORTED_SYMBOLS = ["PeopleImporter", "ImporterBackend", "DiscovererBackend", "PoCoPerson"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/md5.js");
Cu.import("resource://people/modules/people.js");

let PREF_SERVICES = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
let Prefs = PREF_SERVICES.getBranch("extensions.mozillalabs.contacts.");

function PeopleImporterSvc() {
  this._backends = {};
  this._liveBackends = {};
  this._discoverers = {};
  this._discoverersEnabled = {};
  this._liveDiscoverers = {};
  this._log = Log4Moz.repository.getLogger("People.Importer");
  this._log.debug("Importer service initialized");
}
PeopleImporterSvc.prototype = {
  getBackend: function ImporterSvc_getBackend(name) {
    if (!this._liveBackends[name])
      this._liveBackends[name] = new this._backends[name]();
    return this._liveBackends[name];
  },
  isBackend: function ImporterSvc_isBackend(name) {
    if (this._liveBackends[name]) return true;
    return false;
  },  
  registerBackend: function ImporterSvc_register(backend) {
    // this._log.debug("Registering importer backend for " + backend.prototype.name);
    this._backends[backend.prototype.name] = backend;
  },
  getBackends: function ImporterSvc_getBackends() {
    return this._backends;
  },
  
  getDiscoverer: function ImporterSvc_getDiscoverer(name) {
    if (!this._liveDiscoverers[name])
      this._liveDiscoverers[name] = new this._discoverers[name]();
    return this._liveDiscoverers[name];
  },
  registerDiscoverer: function ImporterSvc_registerDiscoverer(disco, defaultEnabled) {
    // this._log.debug("Registering discoverer for " + disco.prototype.name);

    if (defaultEnabled == null || defaultEnabled == undefined) defaultEnabled = true;
    let enabled = defaultEnabled;
    let enabledDiscoverers = null;
    try {
      enabledDiscoverers = Prefs.getCharPref("discoverersenabled");
    } catch (e) {}

    if (enabledDiscoverers) {
      let list = enabledDiscoverers.split(",");
      if (list.indexOf(disco.prototype.name) >= 0) enabled = true;
      else enabled = false;
    }
    this._discoverers[disco.prototype.name] = disco;
    this._discoverersEnabled[disco.prototype.name] = enabled;
  },
  setDiscovererEnabled: function ImporterSvc_setDiscovererEnabled(name, value) 
  {
    let enabledDiscoverers = null;
    try {
      enabledDiscoverers = Prefs.getCharPref("discoverersenabled");
    } catch (e) {}
    
    if (value) {
      if (!enabledDiscoverers) enabledDiscoverers = name;
      else {
        let list = enabledDiscoverers.split(",");
        if (list.indexOf(disco.prototype.name) < 0) enabledDiscoverers += "," + name;
      }
      Prefs.setCharPref("discoverersenabled", enabledDiscoverers);
    } else {
      if (enabledDiscoverers) {
        let list = enabledDiscoverers.split(",");
        let result = enabledDiscoverers.filter(function (e) {return (e != name)});
        Prefs.setCharPref("discoverersenabled", result);
      }
    }
    this._discoverersEnabled[name] = value;
  },
  getDiscoverers: function ImporterSvc_getDiscoverers() {
    return this._discoverers;
  },
  getEnabledDiscoverers: function ImporterSvc_getEnabledDiscoverers() {
    return this._discoverersEnabled;
  },
  
  getService: function getService(name) {
    var idx = name.indexOf(":");
    if (idx > 0) {
      name = name.slice(idx+1);
    }
    let s = this._backends[name];
    if (s) return this.getBackend(name);
    s = this._discoverers[name];
    if (s) return this.getDiscoverer(name);
    return null;
  }
};
let PeopleImporter = new PeopleImporterSvc();

function ImporterBackend() {
  this._log = Log4Moz.repository.getLogger("People.ImporterBackend");
  this._log.debug("Initializing importer backend for " + this.displayName);
}
ImporterBackend.prototype = {
  get name() "example",
  get displayName() "Example Contacts",
  getPrimaryKey: function (person){
    if(person.accounts && person.accounts.length > 0 && person.accounts[0].userid) return person.accounts[0].userid;
    if(person.accounts && person.accounts.length > 0 && person.accounts[0].username) return person.accounts[0].username;
    if(person.emails && person.emails.length > 0 && person.emails[0].value) return person.emails[0].value;
    if(person.displayName) return person.displayName;
    return "NotUnique";
  },
  getLinkFromKey: function (key){
    return "";
  },
  explainString : function explainString() {
    return "From importing your \"" + this.name + "\" contacts:";
  },
  import: function Backend_import() {
    this._log.debug("ImporterBackend.import() invoked, base class does nothing");
  },
  disconnect : function Backend_disconnect() {
  
  }
};

function DiscovererBackend() {
  this._log = Log4Moz.repository.getLogger("People.DiscovererBackend");
  this._log.debug("Initializing discovery backend for " + this.displayName);
}
DiscovererBackend.prototype = {
  get name() "example",
  get displayName() "Example Discoverer",
  // Necessary for mergehints
  getPrimaryKey: function (person){
    if(person.accounts && person.accounts.length > 0 && person.accounts[0].userid) return person.accounts[0].userid;
    if(person.accounts && person.accounts.length > 0 && person.accounts[0].username) return person.accounts[0].username;
    if(person.emails && person.emails.length > 0 && person.emails[0].value) return person.emails[0].value;
    if(person.displayName) return person.displayName;
    return "NotUnique";
  },
  // See if we can get a link to a person based on their primary key
  getLinkFromKey: function (key){
    return "";
  },

 explainString : function explainString() {
    return "From searching for this contact with " + this.name;
  },

  discover: function Discoverer_discover(person, completionCallback, progressCallback) {
    // When you're done, call completionCallback with a new document
    this._log.debug("DiscovererBackend.import() invoked, base class does nothing");
  }
};

/*
function PoCoPerson(contact) {
  this._init();
  if (contact)
    this.setPoCo(contact);
}
PoCoPerson.prototype = {
  __proto__: Person.prototype,
  
  setPoCo: function setPoCo(contact) {
    this._obj.documents.default = contact;
    this._obj.documentSchemas = "http://portablecontacts.net/draft-spec.html";

    let doc = this._obj.documents.default;

    if (doc.displayName)
      this._obj.displayName = doc.displayName;

    if (doc.name) {
      if (doc.name.givenName)
        this._obj.givenName = doc.name.givenName;
      if (doc.name.familyName)
        this._obj.familyName = doc.name.familyName;
    }

    for each (let e in doc.emails) {
      if (!this._obj.emails)
        this._obj.emails = [];
      this._obj.emails.push({value: e.value, type: e.type});
    }
  }
  
};*/

//function getYahooContacts( callback ){
//  var url = "http://us.mg1.mail.yahoo.com/yab";
//  //TODO: I have no idea what these params mean
//  var params = {
//    v: "XM",
//    prog: "ymdc",
//    tags: "short",
//    attrs: "1",
//    xf: "sf,mf"
//  };
//
//  var asyncRequest = jQuery.get(url, params, function(data) {
//
//    var contacts = [];
//    for each( var line in jQuery(data).find("ct") ){
//      var name = jQuery(line).attr("yi");
//      //accept it as as long as it is not undefined
//      if(name){
//        var contact = {};
//        contact["name"] = name;
//        //TODO: what about yahoo.co.uk or ymail?
//        contact["email"] = name + "@yahoo.com";
//        contacts.push(contact);
//      }
//    }
//
//    callback(contacts);
//  }, "text");
//
//  return asyncRequest;
//}


// Now load the built-ins:
Cu.import("resource://people/modules/importers/abcard.js");
Cu.import("resource://people/modules/importers/native.js");
Cu.import("resource://people/modules/importers/facebook.js");
Cu.import("resource://people/modules/importers/gmail.js");
Cu.import("resource://people/modules/importers/linkedin.js");
Cu.import("resource://people/modules/importers/plaxo.js");
Cu.import("resource://people/modules/importers/twitter.js");
Cu.import("resource://people/modules/importers/yahoo.js");
//Cu.import("resource://people/modules/importers/lastfm.js");

Cu.import("resource://people/modules/importers/webfinger.js");
//Cu.import("resource://people/modules/importers/googleSocialGraph.js");
Cu.import("resource://people/modules/importers/gravatar.js");
Cu.import("resource://people/modules/importers/flickr.js");
//Cu.import("resource://people/modules/importers/yelp.js");
Cu.import("resource://people/modules/importers/hcard.js");
// Cu.import("resource://people/modules/importers/amazon.js");
