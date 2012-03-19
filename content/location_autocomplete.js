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
 *   Edward Lee <edilee@mozilla.com>
 *   Michael Hanson <mhanson@mozilla.com>
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

let EXPORTED_SYMBOLS = [];

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://people/modules/people.js");

// nsIAutoCompleteSearch to put keyword results from the db into autocomplete
let showKeywords = let (T = {
  startSearch: function(searchString, searchParam, previous, listener) {
    let keyword = searchString.toLowerCase();
    
    var peopleResults = People.find({displayName:keyword});
    var peopleResultsEmail = People.find({emails:keyword});

    // De-dupe:
    var finalResults = peopleResults;
    for each (var p in peopleResultsEmail) {
      var already = false;
      for each (var check in finalResults) {
        if (check.guid == p.guid) {already=true;break;}
      }
      if (!already) finalResults.push(p);
    }
    peopleResults = finalResults;

    // Require a full match on a name or email element before we display:
    var fullMatchResults = [];
    for each (var p in peopleResults) {
      var fullMatch = false;
      if (p.displayName.toLowerCase() == keyword) {
        fullMatch = true;
      }
      else {
        p.name = p.getProperty("name");
        if (p.name) {
          if (p.name.givenName.toLowerCase() == keyword) {
            fullMatch = true;
          } else if (p.name.familyName.toLowerCase() == keyword) {
            fullMatch = true;
          }
        }
        if (!fullMatch) {
          for each (var em in p.getProperty("emails"))
          {
            if (em.value && em.value.split("@")[0].toLowerCase() == keyword) {
              fullMatch = true;
            }
          }
        }
      }
      if (fullMatch) fullMatchResults.push(p);
    }
    peopleResults = fullMatchResults;

    // nsIAutoCompleteResult object to give the autocomplete controller
    let result = {
      get searchString() searchString,
      searchResult: Components.interfaces.nsIAutoCompleteResult.RESULT_SUCCESS,
      get matchCount() peopleResults.length,
      getValueAt: function(i) {
        var emails = peopleResults[i].getProperty("emails");
        if (emails && emails.length>0) return "person:" + emails[0].value;
        else return "person:" + peopleResults[i].displayName;
      },
      getCommentAt: function(i) {
        return peopleResults[i].displayName;
      },
      getImageAt: function(i) {
        var photos = peopleResults[i].getProperty("photos");
        if (photos && photos.length>0) return photos[0].value;
        else return null;
      },
      getStyleAt: function() "people",
      removeValueAt: function() {},
      QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIAutoCompleteResult])
    };

    // Inform the listener of the result
    let done = function() listener.onSearchResult(T, result);

    // If we got a search engine, inform the listener right away
    if (true)
      done();
    // No matches, so wait a little to prevent other searches from stopping
    else {
      T.stopSearch();
      result.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_NOMATCH;
      T.timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
      T.timer.initWithCallback({ notify: done }, 500, T.timer.TYPE_ONE_SHOT);
    }
  },

  // Cancel the nomatch timer if it hasn't triggered yet
  stopSearch: function() {
    if (T.timer == null)
      return;
    T.timer.cancel();
    T.timer = null;
  },

  createInstance: function(outer, iid) showKeywords.QueryInterface(iid),
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIFactory, Components.interfaces.nsIAutoCompleteSearch])
}) T;

// Register the keywords autocomplete search engine
Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar).registerFactory(
  Components.classes["@mozilla.org/uuid-generator;1"].getService(Components.interfaces.nsIUUIDGenerator).
  generateUUID(), "People AutoCompleteSearch",
  "@mozilla.org/autocomplete/search;1?name=people", showKeywords);
