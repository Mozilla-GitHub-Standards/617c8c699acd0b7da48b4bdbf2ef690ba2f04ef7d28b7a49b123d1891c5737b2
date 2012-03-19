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
 *   Myk Melez <myk@mozilla.org>
 *   Justin Dolske <dolske@mozilla.com>
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

/* Inject the People content API into window.navigator objects. */
/* Partly based on code in the Geode extension. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const ALL_GROUP_CONSTANT = "___all___";
let refreshed;

let PeopleInjector = {
  // URI module
  URI: null,

  // People module
  People: null,

  onLoad: function() {
    var obs = Components.classes["@mozilla.org/observer-service;1"].
                          getService(Components.interfaces.nsIObserverService);
    obs.addObserver(this, 'content-document-global-created', false);
  },

  onUnload: function() {
    var obs = Components.classes["@mozilla.org/observer-service;1"].
                          getService(Components.interfaces.nsIObserverService);
    obs.removeObserver(this, 'content-document-global-created');
  },


  observe: function(aSubject, aTopic, aData) {
    if (!aSubject.location.href) return;
    // is this window a child of OUR XUL window?
    var mainWindow = aSubject.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIWebNavigation)
                   .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                   .rootTreeItem
                   .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIDOMWindow); 
    if (mainWindow != window) {
      return;
    }
    this._inject(aSubject);
  },

  //**************************************************************************//
  // 

  get _scriptToInject() {
    delete this._scriptToInject;

    var scriptToInject =  (function () {
      if (window && navigator){
        if (!navigator.service)
          navigator.service = {};
        navigator.service.contacts = {
          find: function(fields, successCallback, failureCallback, options) {
            contacts_find(window, fields, successCallback, failureCallback, options);
          }
        };
      }
    }).toString();

    return this._scriptToInject = "("+scriptToInject+")();";
  },

  /*
   * _inject
   *
   * Injects the content API into the specified DOM window.
   */
  _inject: function(safeWin) {
    if (typeof(XPCNativeWrapper) != 'undefined') {
      // ensure we do indeed have a nativewrapper
      safeWin = new XPCNativeWrapper(safeWin);
    }
    // options here are ignored for 3.6
    let sandbox = new Components.utils.Sandbox(safeWin, { sandboxProto: safeWin, wantXrays: true });
    sandbox.importFunction(this._getFindFunction(), "contacts_find");
    sandbox.window = safeWin;
    sandbox.navigator = safeWin.navigator.wrappedJSObject;
    Components.utils.evalInSandbox(this._scriptToInject, sandbox, "1.8");
  },

  _getFindFunction: function() {
    // Make the People module accessible to the find function via a closure.
    let People = this.People;
    let URI = this.URI;

    return function(win, fields, successCallback, failureCallback, options) {
      // fx 4 no longer has XPCSafeJSObjectWrapper, it is handled transparently
      if (typeof(XPCSafeJSObjectWrapper) != 'undefined') {
        win = XPCSafeJSObjectWrapper(win);
        options = XPCSafeJSObjectWrapper(options);
        successCallback = XPCSafeJSObjectWrapper(successCallback);
        failureCallback = XPCSafeJSObjectWrapper(failureCallback);
      }

      let permissionManager = Components.classes["@mozilla.org/permissionmanager;1"].
                              getService(Components.interfaces.nsIPermissionManager);
      let uri = new URI(win.location);

      function onAllow() {
        // This function is called when the user clicks "Allow..."
        // or automatically because a) they are in a built-in screen,
        // or b) they've saved the permissions.
      
        try {
        
          let people = null;
  
          if (win.location != "chrome://people/content/manager.xhtml" && 
              win.location != "chrome://people/content/disclosure.xhtml")
          {
            // Special field for services
            let Prefs = Components.classes["@mozilla.org/preferences-service;1"]
                               .getService(Components.interfaces.nsIPrefService);
            Prefs = Prefs.getBranch("extensions.mozillalabs.contacts.");
            let allow = false;
            try{
              allow = Prefs.getBoolPref("allowServices");
            } catch (e){
              //nothing
            }
            if(allow){
              fields.push("Services");
            } else {
              for (let f in fields){
                if(fields[f] == "Services"){
                  fields.splice(f,1);
                  break;
                }
              }
            }
            
            // if the page was refreshed
            if(refreshed) {
              People.removeSessionSitePermissions(uri.spec);
              refreshed = false;
            }
            
            // Check for saved site permissions; if none are found, present the disclosure box
            people = People.find({});
            let groupList = null;
            let permissions = People.getSitePermissions(uri.spec);
  
            // TODO: If the site has asked for a new field permission,
            // ask the user again (but this could get annoying, hm)
            if (permissions) {
              var extendedPermissions = false;
              for each (f in fields) {
                if (permissions.fields.indexOf(f) < 0) {
                  extendedPermissions = true;
                }
              }
              if (extendedPermissions) permissions = null;
            }
            
            if (permissions == null)
            {
              groupMap = {};
              let fieldsActive = {};
              let remember = {value:false};
              let loc;
              try {
                loc = win.location.host;
              } catch (e) {
                loc = win.location;
              }
              
              var params = {
                site: loc,
                fields: fields, 
                fieldsActive: fieldsActive, // on exit, a map of fields to booleans
                peopleList: people,
                selectedGroups: groupMap, // on exit, a map of tags to booleans
                remember: remember,
                cancelled: false
              };
              var disclosureDialog = openDialog("chrome://people/content/disclosure.xul", "Access to Contacts", "modal", params);
               if (!params.cancelled)
              {
                // Construct allowed field list...
                var allowedFields = [];
                for each (f in fields) {
                  if (fieldsActive[f]) allowedFields.push(f);
                }
                groupList = [];
                for (g in groupMap) {
                  if (groupMap[g]) groupList.push(g);
                }
                
                if (remember.value) {
                  People.storeSitePermissions(uri.spec, allowedFields, groupList);
                  // This blows up if uri doesn't have a host
                  permissionManager.add(uri, "people-find",
                                        Components.interfaces.nsIPermissionManager.ALLOW_ACTION);
                }
  
                // TODO: Checkbox to allow "just once"
                People.setSessionSitePermissions(uri.spec, allowedFields, groupList);
  
              } else {
                // user cancelled
                return onDeny();
              }
            } else {
              // saved permissions exist:
              // set fields to the minimum overlapping set of saved permissions and what the site wanted.
              var allowedFields = [];
              for each (f in fields) {
                if (permissions.fields.indexOf(f) >= 0) {
                  allowedFields.push(f);
                }
              }
              
              // and set groups to what the user saved
              groupList = permissions.groups;
            }
            
            // Limit the result data...
            fields = allowedFields;
            People.findExternal(fields, successCallback, failureCallback, options, groupList);
            
          } else {
            fields.push("Services");
            People.findExternal(fields, successCallback, failureCallback, options);
          }

        } catch (e) {
          dump(e + "\n");
          dump(e.stack + "\n");
        }
      }

      function onDeny() {
        People._log.warn("user denied permission for people.find call");
        let error = { message: "permission denied" };
        if (failureCallback) {
          try {
            failureCallback(error);
          }
          catch(ex) {
            People._log.warn("Error: " + ex);
            Components.utils.reportError(ex);
          }
        } else {
          People._log.warn("No failure callback");
        }

        // FIXME: We have no way to persist a deny right now, since we moved the checkbox into the disclosure dialog.
/*        if (checkbox && checkbox.checked) {
          permissionManager.add(uri, "people-find",
                                Components.interfaces.nsIPermissionManager.DENY_ACTION);
        }*/
      }

      // Special-case the built-in people manager, which has content privileges
      // to prevent malicious content from exploiting bugs in its implementation
      // to get chrome access but should always have access to your people
      // (since it is a feature of this extension).
      if (win.location == "chrome://people/content/manager.xhtml" || 
          win.location == "chrome://people/content/disclosure.xhtml") 
      {
        onAllow();
        return;
      }


      // TODO HACK: To support session permissions,
      // check sitePermissions here
      let permissions = People.getSitePermissions(uri.spec);
      if (permissions) {
        onAllow();
        return;
      }
      else
      {
        switch(permissionManager.testPermission(uri, "people-find")) {
          case Components.interfaces.nsIPermissionManager.ALLOW_ACTION:
            onAllow();
            return;
          case Components.interfaces.nsIPermissionManager.DENY_ACTION:
            onDeny();
            return;
          case Components.interfaces.nsIPermissionManager.UNKNOWN_ACTION:
          default:
            // fall through to the rest of the function.
        }
      }

      function getNotificationBox() {
        let notificationBox;

        // Get topmost window, in case we're in a frame.
        let doc = win.top.document;

        // Find the <browser> that contains the document by looking through
        // all the open windows and their <tabbrowser>s.
        let wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].
                 getService(Components.interfaces.nsIWindowMediator);
        let enumerator = wm.getEnumerator("navigator:browser");
        let tabBrowser = null;
        let foundBrowser = null;
        while (!foundBrowser && enumerator.hasMoreElements()) {
          tabBrowser = enumerator.getNext().getBrowser();
          foundBrowser = tabBrowser.getBrowserForDocument(doc);
        }
        if (foundBrowser)
          notificationBox = tabBrowser.getNotificationBox(foundBrowser);
    
        return notificationBox;
      }

      let site = win.location.host || win.location;
      let promptText = "The page at " + site + " wants to access some of your contacts data.";
      let buttons = [
        {
          label:     "Do Not Allow Access",
          accessKey: "n",
          popup:     null,
          callback:  function(bar) onDeny()
        },
        {
          label:     "Allow Access...",
          accessKey: "a",
          popup:     null,
          callback:  function(bar) onAllow()
        },
      ];

      let box = getNotificationBox();
      let oldBar = box.getNotificationWithValue("moz-people-find");

      let newBar = box.appendNotification(promptText,
                                          "moz-people-find",
                                          null,
                                          box.PRIORITY_INFO_MEDIUM,
                                          buttons);

/*      let checkbox = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul","checkbox");
      checkbox.setAttribute("id", "rememberDecision");
      checkbox.setAttribute("label", "Remember for " + site);
      newBar.appendChild(checkbox);
*/
      if (oldBar)
        box.removeNotification(oldBar);
    }
  }
};

Components.utils.import("resource://people/modules/ext/URI.js", PeopleInjector);
Components.utils.import("resource://people/modules/people.js", PeopleInjector);

PeopleInjector.onLoad()
window.addEventListener("unload", function() PeopleInjector.onUnload(), false);
