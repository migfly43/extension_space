
/* spaces
 * Copyright (C) 2015 Dean Oemcke
*/

var spaces = (function () {
    'use strict';

    var spacesPopupWindowId = false,
        spacesOpenWindowId = false,
        previousAllSpacesList = [],
        noop = function() {},        
        debug = false;  
    var current_window ;


    //LISTENERS

    //add listeners for session monitoring
    chrome.tabs.onCreated.addListener(function(tab) {
        //this call to checkInternalSpacesWindows actually returns false when it should return true
        //due to the event being called before the globalWindowIds get set. oh well, never mind.
        if (checkInternalSpacesWindows(tab.windowId, false)) return;
        //don't need this listener as the tabUpdated listener also fires when a new tab is created
        //spacesService.handleTabCreated(tab);
        updateSpacesWindow('tabs.onCreated');
    });
    chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
        if (checkInternalSpacesWindows(removeInfo.windowId, false)) return;
        spacesService.handleTabRemoved(tabId, removeInfo, function() {
            updateSpacesWindow('tabs.onRemoved');
        });
    });
    chrome.tabs.onMoved.addListener(function (tabId, moveInfo) {     
        if (checkInternalSpacesWindows(moveInfo.windowId, false)) return;
        spacesService.handleTabMoved(tabId, moveInfo, function() {
            updateSpacesWindow('tabs.onMoved');
        });
    });
    chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {   
        if (checkInternalSpacesWindows(tab.windowId, false)) return;

        spacesService.handleTabUpdated(tab, changeInfo, function() {
            updateSpacesWindow('tabs.onUpdated');
        });
    });
    chrome.windows.onRemoved.addListener(function (windowId) {
        if (checkInternalSpacesWindows(windowId, true)) return;
        spacesService.handleWindowRemoved(windowId, true, function() {
            updateSpacesWindow('windows.onRemoved');
        });

        //if this was the last window open and the spaces window is stil open
        //then close the spaces window also so that chrome exits fully
        //NOTE: this is a workaround for an issue with the chrome 'restore previous session' option
        //if the spaces window is the only window open and you try to use it to open a space,
        //when that space loads, it also loads all the windows from the window that was last closed
        chrome.windows.getAll({}, function (windows) {
            if (windows.length === 1 && spacesOpenWindowId ) {
                chrome.windows.remove(spacesOpenWindowId);
            }
        });
    });
    //don't need this listener as the tabUpdated listener also fires when a new window is created
    /*chrome.windows.onCreated.addListener(function (window) {

        if (checkInternalSpacesWindows(window.id, false)) return;
        spacesService.handleWindowCreated(window);
    });*/

    //add listeners for tab and window focus changes
    //when a tab or window is changed, close the move tab popup if it is open
    chrome.windows.onFocusChanged.addListener(function(windowId) {
        if (!debug && spacesPopupWindowId) {
        //if (spacesPopupWindowId) {
            closePopupWindow();
        }
        spacesService.handleWindowFocussed(windowId);
    });




    //add listeners for message requests from other extension pages (spaces.html & tab.html)

    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (debug) {
            console.log('listener fired:' + JSON.stringify(request));
        }

        var sessionId,
            windowId,
            tabId;

        //endpoints called by spaces.js
        switch (request.action) {
        case 'loadSession':
            sessionId = _cleanParameter(request.sessionId);
            if (sessionId) {
                handleLoadSession(sessionId);
                sendResponse(true);
            }
            //close the requesting tab (should be spaces.html)
            //if (!debug) closeChromeTab(sender.tab.id);

            return true;
            break;

        case 'loadWindow':
            windowId = _cleanParameter(request.windowId);
            if (windowId) {
                handleLoadWindow(windowId);
                sendResponse(true);
            }
            //close the requesting tab (should be spaces.html)
            //if (!debug) closeChromeTab(sender.tab.id);

            return true;
            break;

        case 'loadTabInSession':
            sessionId = _cleanParameter(request.sessionId);
            if (sessionId && request.tabUrl) {
                handleLoadSession(sessionId, request.tabUrl);
                sendResponse(true);
            }
            //close the requesting tab (should be spaces.html)
            //if (!debug) closeChromeTab(sender.tab.id);

            return true;
            break;

        case 'loadTabInWindow':
            windowId = _cleanParameter(request.windowId);
            if (windowId && request.tabUrl) {
                handleLoadWindow(windowId, request.tabUrl);
                sendResponse(true);
            }
            //close the requesting tab (should be spaces.html)
            //if (!debug) closeChromeTab(sender.tab.id);

            return true;
            break;

        case 'saveNewSession':
            windowId = _cleanParameter(request.windowId);
            if (windowId && request.sessionName) {
                handleSaveNewSession(windowId, request.sessionName, sendResponse);
            }
            return true; //allow async response
            break;

        case 'importNewSession':
            if (request.urlList) {
                handleImportNewSession(request.urlList, sendResponse);
            }
            return true; //allow async response
            break;

        case 'deleteSession':
            sessionId = _cleanParameter(request.sessionId);
            if (sessionId) {
                handleDeleteSession(sessionId, false, sendResponse);
            }
            return true;
            break;

        case 'updateSessionName':
            sessionId = _cleanParameter(request.sessionId);
            if (sessionId && request.sessionName) {
                handleUpdateSessionName(sessionId, request.sessionName, sendResponse);
            }
            return true;
            break;

        case 'requestSpaceDetail':
            windowId = _cleanParameter(request.windowId);
            sessionId = _cleanParameter(request.sessionId);

            if (windowId) {
                if (checkInternalSpacesWindows(windowId, false)) {
                    sendResponse(false);
                } else {
                    requestSpaceFromWindowId(windowId, sendResponse);
                }

            } else if (sessionId) {
                requestSpaceFromSessionId(sessionId, sendResponse);

            }
            return true;
            break;


        //end points called by tag.js and switcher.js
        //note: some of these endpoints will close the requesting tab
        case 'requestAllSpaces':
            requestAllSpaces(function (allSpaces) {
                previousAllSpacesList = allSpaces;
                sendResponse(allSpaces);
            });
            return true;
            break;

        case 'requestHotkeys':
            requestHotkeys(sendResponse);
            return true;
            break;

        case 'requestTabDetail':
            tabId = _cleanParameter(request.tabId);
            if (tabId) {
                requestTabDetail(tabId, function (tab) {
                    if (tab) {
                        sendResponse(tab);
                    } else {

                        //close the requesting tab (should be tab.html)
                        closePopupWindow();
                    }
                });
            }
            return true;
            break;

        case 'requestShowSpaces':
            windowId = _cleanParameter(request.windowId);

            //show the spaces tab in edit mode for the passed in windowId
            if (windowId) {
                showSpacesOpenWindow(windowId, request.edit);
            } else {
                showSpacesOpenWindow();
            }
            return false;
            break;

        case 'requestShowSwitcher':
            showSpacesSwitchWindow();
            return false;
            break;

        case 'requestShowMover':
            showSpacesMoveWindow();
            return false;
            break;

        case 'requestShowKeyboardShortcuts':
            createShortcutsWindow();
            return false;
            break;

        case 'requestClose':
            //close the requesting tab (should be tab.html)
            closePopupWindow();
            return false;
            break;

        case 'switchToSpace':
            windowId = _cleanParameter(request.windowId);
            sessionId = _cleanParameter(request.sessionId);
            var oldWindowId = _cleanParameter(request.oldWindowId);
            var oldSessionId = _cleanParameter(request.oldSessionId);
           
            if (windowId) {
                handleLoadWindow(windowId);
            } else if (sessionId) {
                handleLoadSession(sessionId, false ,oldSessionId);
            }

            if ( oldWindowId!=windowId&&(localStorage.getItem("checkClose")=="true"|| localStorage.getItem("checkClose") == null ) ) {
                closePrevWindow(oldWindowId);
            } 

            return false;
            break;

        case 'addLinkToNewSession':
            tabId = _cleanParameter(request.tabId);
            if (request.sessionName && request.url) {
                handleAddLinkToNewSession(request.url, request.sessionName, function(result) {

                    if (result) updateSpacesWindow('addLinkToNewSession');

                    //close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;
            break;

        case 'moveTabToNewSession':
            tabId = _cleanParameter(request.tabId);
            if (request.sessionName && tabId) {
                handleMoveTabToNewSession(tabId, request.sessionName, function(result) {

                    if (result) updateSpacesWindow('moveTabToNewSession');

                    //close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;
            break;

        case 'addLinkToSession':
            sessionId = _cleanParameter(request.sessionId);

            if (sessionId && request.url) {
                handleAddLinkToSession(request.url, sessionId, function(result) {

                    if (result) updateSpacesWindow('addLinkToSession');

                    //close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;
            break;

        case 'moveTabToSession':
            sessionId = _cleanParameter(request.sessionId);
            tabId = _cleanParameter(request.tabId);

            if (sessionId && tabId) {
                handleMoveTabToSession(tabId, sessionId, function(result) {

                    if (result) updateSpacesWindow('moveTabToSession');

                    //close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;
            break;

        case 'addLinkToWindow':
            windowId = _cleanParameter(request.windowId);

            if (windowId && request.url) {
                handleAddLinkToWindow(request.url, windowId, function(result) {

                    if (result) updateSpacesWindow('addLinkToWindow');

                    //close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;
            break;

        case 'moveTabToWindow':
            windowId = _cleanParameter(request.windowId);
            tabId = _cleanParameter(request.tabId);

            if (windowId && tabId) {
                handleMoveTabToWindow(tabId, windowId, function(result) {

                    if (result) updateSpacesWindow('moveTabToWindow');

                    //close the requesting tab (should be tab.html)
                    closePopupWindow();
                });
            }
            return false;
            break;

        case 'addSapce':        
            handleCreateNewSession(request.spacename, function(session){               
                handleLoadSession(session.id, false , request.oldSessionId); 
                if (request.oldWindowId) {
                    closePrevWindow(request.oldWindowId);
                }                
            });
            
            return false;
            break;    
            
        case 'updateSpaceOrder':
            handleUpdateOrder(request.order, function(){});
            
            return false;
            break;    

        case "resizeWindow" :
            restoreWindowSize(request.position, sender.tab.windowId, function(){}) ; 

            return false;
            break;  
        case "requestCheckClose" :
            localStorage.setItem("checkClose", request.checkClose);           
            chrome.windows.getAll({}, function (windows) {
                windows.forEach(function(window){
                    if (window.id != request.activeWindowId ) {
                        chrome.windows.remove(window.id);
                    }      
                });                             
            });

            return false;
            break;  
        default:
            return false;
            break;
        }
    });
    function _cleanParameter(param) {

        if (typeof param === 'number') {
            return param;

        } else if (param === 'false') {
            return false;

        } else if (param === 'true') {
            return true;

        } else {
            return parseInt(param, 10);
        }
    }



    //add listeners for keyboard commands

    chrome.commands.onCommand.addListener(function (command) {

        //handle showing the move tab popup (tab.html)
        if (command === 'spaces-move') {
            showSpacesMoveWindow();

        //handle showing the switcher tab popup (switcher.html)
        } else if (command === 'spaces-switch') {
            showSpacesSwitchWindow();
        }
    });

    //add context menu entry

    chrome.contextMenus.create({
        id: 'spaces-add-link',
        title: "Add link to space...",
        contexts:["link"]
    });
    chrome.contextMenus.onClicked.addListener(function (info, tab) {

        //handle showing the move tab popup (tab.html)
        if (info.menuItemId === 'spaces-add-link') {
            showSpacesMoveWindow(info.linkUrl);
        }
    });


    //runtime extension install listener
    chrome.runtime.onInstalled.addListener(function(details){
        if (details.reason == "install") {
            console.log("This is a first install!");
            if (debug) {
                alert('newly installed!');
                debugger;
            }
            showSpacesOpenWindow();

        } else if (details.reason == "update") {
            var thisVersion = chrome.runtime.getManifest().version;
            if (details.previousVersion !== thisVersion) {
                console.log("Updated from " + details.previousVersion + " to " + thisVersion + "!");
            }
        }
    });

    function createShortcutsWindow() {
        chrome.tabs.create({url: 'chrome://extensions/configureCommands'});
    }

    function showSpacesOpenWindow(windowId, editMode) {

        var url;

        if (editMode && windowId) {
            url = chrome.extension.getURL('spaces.html#windowId=' + windowId + '&editMode=true');
        } else {
            url = chrome.extension.getURL('spaces.html');
        }

        //if spaces open window already exists then just give it focus (should be up to date)
        if (spacesOpenWindowId) {
            chrome.windows.get(spacesOpenWindowId, {populate: true}, function (window) {
                chrome.windows.update(spacesOpenWindowId, {focused: true});
                if (window.tabs[0].id) {
                    chrome.tabs.update(window.tabs[0].id, {url: url});
                }
            });

        //otherwise re-create it
        } else {
            chrome.windows.create({
                    type: 'popup',
                    url: url,
                    height: screen.height - 100,
                    width: Math.min(screen.width, 1000),
                    top: 0,
                    left: 0
                }, function (window) {
                spacesOpenWindowId = window.id;
            });
        }
    }
    function showSpacesMoveWindow(tabUrl) {

        //get currently highlighted tab
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {

            if (tabs.length === 0) return;

            var activeTab = tabs[0],
                name,
                url,
                session;

            //make sure that the active tab is not from an internal spaces window
            if (checkInternalSpacesWindows(activeTab.windowId, false)) {
                return;
            }

            session = spacesService.getSessionByWindowId(activeTab.windowId);

            name = session ? session.name : '';

            url = chrome.extension.getURL('tab.html#' + 'windowId=' + activeTab.windowId + '&sessionName=' + name);
            if (tabUrl) {
                url += '&url=' + encodeURIComponent(tabUrl);
            } else {
                url += '&tabId=' + activeTab.id;
            }

            createOrShowSpacesPopupWindow(url);
        });
    }
    function showSpacesSwitchWindow() {

        var url = chrome.extension.getURL('switcher.html');
        createOrShowSpacesPopupWindow(url);
    }

    function createOrShowSpacesPopupWindow(url) {

        //if spaces  window already exists
        if (spacesPopupWindowId) {

            chrome.windows.get(spacesPopupWindowId, {populate: true}, function (window) {

                //if window is currently focused then don't update
                if (window.focused) {
                    return;

                //else update url and give it focus
                } else {
                    chrome.windows.update(spacesPopupWindowId, {focused: true});
                    if (window.tabs[0].id) {
                        chrome.tabs.update(window.tabs[0].id, {url: url});
                    }
                }
            });

        //otherwise create it
        } else {

            chrome.windows.create({
                type: 'popup',
                url: url,
                focused: true,
                height: 420,
                width: 316,
                top: (screen.height-420),
                left: (screen.width-316)
            }, function (window) {
                spacesPopupWindowId = window.id;
            });
        }
    }

    function closeChromeTab(tabId) {
        chrome.tabs.remove(tabId, function (result) {
            if (chrome.runtime.lastError) {
                console.log(chrome.runtime.lastError.message);
            }
        });
    }

    function closePopupWindow() {
        if (spacesPopupWindowId) {
            chrome.windows.remove(spacesPopupWindowId, function (result) {
                if (chrome.runtime.lastError) {
                    console.log(chrome.runtime.lastError.message);
                }
            });
        }
    }

    function closePrevWindow(windowId){
        if (windowId) {
            chrome.windows.remove(windowId, function (result) {
                if (chrome.runtime.lastError) {
                    console.log(chrome.runtime.lastError.message);
                }
            });
        } 
    }

    function updateSpacesWindow(source) {

        if (debug) console.log('updateSpacesWindow triggered. source: ' + source);

         requestAllSpaces(function (allSpaces) {
            chrome.runtime.sendMessage({action: 'updateSpaces', spaces: allSpaces});
        });
    }

    function checkInternalSpacesWindows(windowId, windowClosed) {


        if (windowId === spacesOpenWindowId) {
            if (windowClosed) spacesOpenWindowId = false;
            return true;

        } else if (windowId === spacesPopupWindowId) {
            if (windowClosed) spacesPopupWindowId = false;
            return true;
        }
    }

    function checkSessionOverwrite(session) {

        //make sure session being overwritten is not currently open
        if (session.windowId) {
            alert('A session with this name is currently open an cannot be overwritten');
            return false;

        //otherwise prompt to see if user wants to overwrite session
        } else {
            return window.confirm('Replace existing space with the same name?');
        }
    }

    function checkSessionDelete(session) {

        return window.confirm('Are you sure you want to delete the space: ' + session.name + '?');
    }






    function requestHotkeys(callback) {
        chrome.commands.getAll(function (commands) {

            var switchStr,
                moveStr,
                spacesStr;

            commands.forEach(function (command) {
                if (command.name === 'spaces-switch') {
                    switchStr = command.shortcut;
                } else if (command.name === 'spaces-move') {
                    moveStr = command.shortcut;
                } else if (command.name === 'spaces-open') {
                    spacesStr = command.shortcut;
                }
            });

            callback({
                switchCode: switchStr,
                moveCode: moveStr,
                spacesCode: spacesStr
            });
        });
    }

    function requestTabDetail(tabId, callback) {

        chrome.tabs.get(tabId, callback);
    }

    function requestCurrentSpace(callback) {
        chrome.windows.getCurrent(function (window) {
            requestSpaceFromWindowId(window.id, callback);
        });
    }

    //returns a 'space' object which is essentially the same as a session object
    //except that includes space.sessionId (session.id) and space.windowId
    function requestSpaceFromWindowId(windowId, callback) {

        //first check for an existing session matching this windowId
        var session = spacesService.getSessionByWindowId(windowId);

        if (session) {
            callback({
                sessionId: session.id,
                windowId: session.windowId,
                name: session.name,
                tabs: session.tabs,
                history: session.history,
                checkClose: localStorage.getItem('checkClose')
            });

        //otherwise build a space object out of the actual window
        } else {

            chrome.windows.get(windowId, {populate: true}, function(window) {

                //if failed to load requested window
                if (chrome.runtime.lastError) {
                    callback(false);

                } else {
                    callback({
                        sessionId: false,
                        windowId: window.id,
                        name: false,
                        tabs: window.tabs,
                        history: false,
                        checkClose: localStorage.getItem('checkClose')
                    });
                }
            });
        }
    }

    function requestSpaceFromSessionId(sessionId, callback) {

        var session = spacesService.getSessionBySessionId(sessionId);

        callback({
            sessionId: session.id,
            windowId: session.windowId,
            name: session.name,
            tabs: session.tabs,
            history: session.history
        });
    }
  
    
    chrome.windows.onFocusChanged.addListener(function(window){
        current_window = window;
    })

    function requestAllSpaces(callback) {

        var sessions,
            allSpaces;
              
        sessions = spacesService.getAllSessions();
        if( current_window==-1 ){
            chrome.windows.getCurrent(function(window){
                if(window){
                    current_window = window.id    
                }                
            })
        }

        allSpaces = sessions
            .map(function(session) {
                if(session.windowId == current_window){                   
                    return {
                        sessionId: session.id,
                        windowId: session.windowId,
                        name: session.name,
                        tabs: session.tabs,
                        order: session.order,
                        history: session.history,
                        lastAccess: session.lastAccess,
                        selected: true
                    };   
                }else{
                    return {
                        sessionId: session.id,
                        windowId: session.windowId,
                        name: session.name,
                        tabs: session.tabs,
                        order: session.order,
                        history: session.history,
                        lastAccess: session.lastAccess,
                        selected: false
                    };    
                }                    
            });
        
        //sort results
        allSpaces.sort(spaceDateCompare);

        callback(allSpaces);
        
    }

    function spaceDateCompare(a,b) {

        if(a.sessionId == false){
            return -1;
        }else if(b.sessionId == false){
            return 1;
        }
        return a.order - b.order;

        /*
        //order open sessions first
        if (a.windowId && !b.windowId) {
            return -1;
        } else if (!a.windowId && b.windowId) {
            return 1;
        }

        //then order by last access date
        } else if (a.lastAccess > b.lastAccess) {
            return -1;
        } else if (a.lastAccess < b.lastAccess) {
            return 1;

        } else {
            return 0;
        }*/

    }


    function handleLoadSession(sessionId, tabUrl, oldSessionId) {

        var session = spacesService.getSessionBySessionId(sessionId),
            oldSession = spacesService.getSessionBySessionId(oldSessionId),
            pinnedTabId,
            urls,
            match;

        //if space is already open, then give it focus
        if (session.windowId) {
            handleLoadWindow(session.windowId, tabUrl);

        //else load space in new window
        } else {

            //urls = session.tabs.map(function(curTab) {return curTab.url;});
            var height = screen.height - 100,
                width = screen.width - 100,
                top =0,
                left=0;
            var pinnedTab = [], urls=[], oldSessionTabUrls = [];

            session.tabs.forEach(function(curTab){
                if(curTab.pinned){
                    pinnedTab.push(curTab.url); 
                }else{
                    urls.push(curTab.url); 
                }  
            });

            if(oldSession){

                oldSession.tabs.forEach(function(oldTab){ 
                    if(oldTab.pinned){
                        oldSessionTabUrls.push(oldTab.url); 
                    }           
                });
                var temp = []
                pinnedTab.forEach(function(url){
                    if( !oldSessionTabUrls.includes(url) ){
                        temp.push(url);
                    }
                });
                pinnedTab = temp.concat(oldSessionTabUrls);
                
            }

            urls = pinnedTab.concat(urls);

            if(session.position){
                height = session.position.screenY;
                width = session.position.screenX;
                top = session.position.top;
                left= session.position.left;
            }

            chrome.windows.create({
                    url: urls,
                    height: height,
                    width: width,
                    top: top,
                    left: left
                }, function (newWindow) {

                //force match this new window to the session
                spacesService.matchSessionToWindow(session, newWindow);
               
                //after window has loaded try to pin any previously pinned tabs
                newWindow.tabs.some(function(curNewTab) {
                    var index = pinnedTab.indexOf(curNewTab.url);
                    if( index >=0 ){
                        pinnedTab.splice(index, 1);
                        chrome.tabs.update(curNewTab.id, {pinned: true});   
                    }
                });
                    
                /*
                var pinnedTab_url=[];
                session.tabs.forEach(function (curSessionTab) {

                    if (curSessionTab.pinned) {
                        pinnedTabId = false;
                        newWindow.tabs.some(function(curNewTab) {
                            if (curNewTab.url === curSessionTab.url) {
                                pinnedTabId = curNewTab.id;
                                return true;
                            }
                        });
                        if (pinnedTabId) {
                            chrome.tabs.update(pinnedTabId, {pinned: true});
                        }
                        pinnedTab_url.push( curSessionTab.url );
                    }
                });*/

                /*if(oldSession){
                     oldSession.tabs.forEach(function(sessionTab){                        
                        if(sessionTab.pinned && pinnedTab_url.includes(sessionTab.url)==false){                           
                            chrome.tabs.create({url:sessionTab.url, pinned: true});
                        }
                    });
                }     */          

                //if tabUrl is defined, then focus this tab
                if (tabUrl) {
                    focusOrLoadTabInWindow(newWindow, tabUrl);
                }

                /*session.tabs.forEach(function (curTab) {
                    chrome.tabs.create({windowId: newWindow.id, url: curTab.url, pinned: curTab.pinned, active: false});
                });

                chrome.tabs.query({windowId: newWindow.id, index: 0}, function (tabs) {
                    chrome.tabs.remove(tabs[0].id);
                });*/
            });
        }
    }
    function handleLoadWindow(windowId, tabUrl) {

        //assume window is already open, give it focus
        if (windowId) {
            focusWindow(windowId);
        }

        //if tabUrl is defined, then focus this tab
        if (tabUrl) {
            chrome.windows.get(windowId, {populate: true}, function (window) {
                focusOrLoadTabInWindow(window, tabUrl);
            });
        }
    }

    function focusWindow(windowId) {
        chrome.windows.update(windowId, {focused: true}, function(window){
            
        });
    }

    function focusOrLoadTabInWindow(window, tabUrl) {

        var match;

        match = window.tabs.some(function (tab) {
            if (tab.url === tabUrl) {
                chrome.tabs.update(tab.id, {active: true});
                return true;
            }
        });
        if (!match) {
            chrome.tabs.create({url: tabUrl});
        }
    }

    function handleSaveNewSession(windowId, sessionName, callback) {

        chrome.windows.get(windowId, {populate: true}, function(curWindow) {

            var existingSession = spacesService.getSessionByName(sessionName);

            //if session with same name already exist, then prompt to override the existing session
            if (existingSession) {
                if (!checkSessionOverwrite(existingSession)) {
                    callback(false);
                    return;

                //if we choose to overwrite, delete the existing session
                } else {
                    handleDeleteSession(existingSession.id, true, noop);
                }
            }
            spacesService.saveNewSession(sessionName, curWindow.tabs, curWindow.id, callback);
            return;
        });
    }

    function handleImportNewSession(urlList, callback) {

        var tempName = 'Imported space: ',
            tabList = [],
            count = 1;

        while (spacesService.getSessionByName(tempName + count)) {
            count++;
        }

        tempName = tempName + count;

        tabList = urlList.map(function (text) {
            return {url: text};
        });

        //save session to database
        spacesService.saveNewSession(tempName, tabList, false, callback);
    }

    function handleCreateNewSession(spacename, callback) {

        var tabList = [];  

        //save session to database
        spacesService.saveNewSession(spacename, tabList, false, callback);
    }


    function handleUpdateSessionName(sessionId, sessionName, callback) {

        //check to make sure session name doesn't already exist
        var existingSession = spacesService.getSessionByName(sessionName);

        //if session with same name already exist, then prompt to override the existing session
        if (existingSession) {
            if (!checkSessionOverwrite(existingSession)) {
                callback(false);
                return;

            //if we choose to override, then delete the existing session
            } else {
                handleDeleteSession(existingSession.id, true, noop);
            }
        }
        spacesService.updateSessionName(sessionId, sessionName, callback);
        return;
    }

    function handleDeleteSession(sessionId, force, callback) {

        var session = spacesService.getSessionBySessionId(sessionId);
        if (!force && !checkSessionDelete(session)) {
            callback(false);
            return;

        } else {
            spacesService.deleteSession(sessionId, callback);
            return;
        }
    }

    function handleAddLinkToNewSession(url, sessionName, callback) {

        var session = spacesService.getSessionByName(sessionName),
            newTabs = [{url: url}];

        //if we found a session matching this name then return as an error as we are
        //supposed to be creating a new session with this name
        if (session) {
            callback(false);
            return;

        //else create a new session with this name containing this url
        } else {
            spacesService.saveNewSession(sessionName, newTabs, false, callback);
            return;
        }
    }

    function handleMoveTabToNewSession(tabId, sessionName, callback) {

        requestTabDetail(tabId, function(tab) {

            var session = spacesService.getSessionByName(sessionName);

            //if we found a session matching this name then return as an error as we are
            //supposed to be creating a new session with this name
            if (session) {
                callback(false);
                return;

            //else create a new session with this name containing this tab
            } else {

                //remove tab from current window (should generate window events)
                chrome.tabs.remove(tab.id);

                //save session to database
                spacesService.saveNewSession(sessionName, [tab], false, callback);
                return;
            }
        });
    }

    function handleAddLinkToSession(url, sessionId, callback) {

        var session = spacesService.getSessionBySessionId(sessionId),
            newTabs = [{url: url}];

        //if we have not found a session matching this name then return as an error as we are
        //supposed to be adding the tab to an existing session
        if (!session) {
            callback(false);
            return;

        } else {

            //if session is currently open then add link directly
            if (session.windowId) {

                handleAddLinkToWindow(url, session.windowId, callback)
                return;

            //else add tab to saved session in database
            } else {

                //update session in db
                session.tabs = session.tabs.concat(newTabs);
                spacesService.updateSessionTabs(session.id, session.tabs, callback);
                return;
            }
        }
    }

    function handleAddLinkToWindow(url, windowId, callback) {

        chrome.tabs.create({windowId: windowId, url: url, active: false});

        //NOTE: this move does not seem to trigger any tab event listeners
        //so we need to update sessions manually
        spacesService.queueWindowEvent(windowId);

        callback(true);
    }

    function handleMoveTabToSession(tabId, sessionId, callback) {

        requestTabDetail(tabId, function(tab) {

            var session = spacesService.getSessionBySessionId(sessionId),
                newTabs = [tab];

            //if we have not found a session matching this name then return as an error as we are
            //supposed to be adding the tab to an existing session
            if (!session) {
                callback(false);
                return;

            } else {

                //if session is currently open then move it directly
                if (session.windowId) {
                    moveTabToWindow(tab, session.windowId, callback);
                    return;

                //else add tab to saved session in database
                } else {

                    //remove tab from current window
                    chrome.tabs.remove(tab.id);

                    //update session in db
                    session.tabs = session.tabs.concat(newTabs);
                    spacesService.updateSessionTabs(session.id, session.tabs, callback);
                    return;
                }
            }
        });
    }

    function handleMoveTabToWindow(tabId, windowId, callback) {

        requestTabDetail(tabId, function(tab) {
            moveTabToWindow(tab, windowId, callback);
        });
    }
    function moveTabToWindow(tab, windowId, callback) {
        chrome.tabs.move(tab.id, {windowId: windowId, index: -1});

        //NOTE: this move does not seem to trigger any tab event listeners
        //so we need to update sessions manually
        spacesService.queueWindowEvent(tab.windowId);
        spacesService.queueWindowEvent(windowId);

        callback(true);
    }

    function handleUpdateOrder(order, callback){
        if(order.length>0){
            spacesService.updateSpaceOrder(order, callback);
        }
    }

    function restoreWindowSize(position, windowId, callback){
        if(windowId>0){
            spacesService.updateSpacePosition(position, windowId, callback); 
        }        
    }

    return {
        requestCurrentSpace: requestCurrentSpace,
        requestHotkeys: requestHotkeys
    };

}());

spacesService.initialiseSpaces();
spacesService.initialiseTabHistory();
