/*global chrome, dbService, render, createTabHtml */

(function () {


    function getSelectedSpace() {
        return document.querySelector('.space.selected');
    }

    function handleSwitchAction(selectedSpaceEl, prevSpaceEl) {

        chrome.runtime.sendMessage({
            action: 'switchToSpace',
            sessionId: selectedSpaceEl.getAttribute('data-sessionid'),
            windowId: selectedSpaceEl.getAttribute('data-windowid'),            
            oldWindowId: prevSpaceEl.getAttribute('data-windowid'),
            oldSessionId: prevSpaceEl.getAttribute('data-sessionid')
        });
    }

    function handleCloseAction() {
        chrome.runtime.sendMessage({
            action: 'requestClose'
        });
    }

    function getSwitchKeycodes(callback) {

        chrome.runtime.sendMessage({ action: 'requestHotkeys' }, function (commands) {          

            var commandStr = commands.switchCode,
                keyStrArray,
                curStr,
                primaryModifier,
                secondaryModifier,
                mainKeyCode;

            keyStrArray = commandStr.split('+');

            //get keyStr of primary modifier
            primaryModifier = keyStrArray[0];

            //get keyStr of secondary modifier
            secondaryModifier = keyStrArray.length === 3 ? keyStrArray[1] : false;

            //get keycode of main key (last in array)
            curStr = keyStrArray[keyStrArray.length-1];

            //TODO: There's others. Period. Up Arrow etc.
            if (curStr === 'Space') {
                mainKeyCode = 32;
            } else {
                mainKeyCode = curStr.toUpperCase().charCodeAt();
            }

            callback({
                primaryModifier: primaryModifier,
                secondaryModifier: secondaryModifier,
                mainKeyCode: mainKeyCode
            });
        });
    }

    function addEventListeners() {

        var selectedSpaceEl, prevSpaceEl;
        document.getElementById('spaceSelectForm').onsubmit = function (e) {            
            e.preventDefault();
            prevSpaceEl = document.getElementsByClassName("selected")[0];
            handleSwitchAction(getSelectedSpace(), prevSpaceEl);
        };

        var allSpaceEls = document.querySelectorAll('.space');
        Array.prototype.forEach.call(allSpaceEls, function (el) {

            el.onclick = function(e) {

                if( e.target == this || e.target == this.getElementsByClassName("spaceDetail")[0] || e.target == this.getElementsByClassName("spaceTitle")[0] && this.getElementsByClassName("fa-save").length==0){
                    prevSpaceEl = document.getElementsByClassName("selected")[0];
                    handleSwitchAction(el, prevSpaceEl);
                }else if( e.target == this.getElementsByClassName("fa")[0] ){ 
                    var editable = this.getElementsByClassName("spaceEdit")[0]
                        listTitle = this.getElementsByClassName('spaceTitle')[0];
                        listDetail = this.getElementsByClassName('spaceDetail')[0];                        
                       
                    if(editable.getElementsByClassName("fa-edit").length >0 ){
                        editable.innerHTML = '<i class="fa fa-save" aria-hidden="true"></i>';
                        var listEditable = document.createElement('input');
                        listEditable.setAttribute("type","text");
                        if(listTitle.innerText !="(unnamed window)"){
                            listEditable.value = listTitle.innerText;                              
                        }                        
                      
                        this.prepend(listEditable); 
                        listTitle.style.visibility = 'hidden';
                        listDetail.style.visibility = 'hidden';
                        listEditable.focus();                                           
                    }else{

                        var newName = this.getElementsByTagName("input")[0].value,
                            oldName = listTitle.innerHTML;
                            sessionId = this.getAttribute("data-sessionid"),
                            windowId = this.getAttribute("data-windowid");

                        handleNameSave(newName, oldName, sessionId, windowId);

                        editable.innerHTML = '<i class="fa fa-edit" aria-hidden="true"></i>';
                        if(newName != ""){
                            listTitle.innerText = newName;    
                        }
                        
                        listTitle.style.visibility = 'visible';  
                        listDetail.style.visibility = 'visible';
                        this.removeChild(this.getElementsByTagName("input")[0]);  
                    } 
                    
                }                       
            };

            el.onkeyup = function(e){
                if (e.keyCode === 13) {                           
                    el.click(this.getElementsByClassName("fa")[0].click()); 
                }
            }
            
        });

        //Here lies some pretty hacky stuff. Yus! Hax!
        getSwitchKeycodes(function(keyCodes) {

            var body = document.querySelector('body');

            body.onkeyup = function(e) {

                //listen for escape key
                if (e.keyCode === 27) {
                    handleCloseAction();
                    return;
                }

            };
        });
        
    }

    function handleNameSave(newName, oldName, sessionId, windowId) {       

        //if invalid name set then revert back to non-edit mode
        if (newName === oldName || newName.trim() === '') {            
            return;
        }

        //otherwise call the save service
        if (sessionId != "false") {
            performSessionUpdate(newName, sessionId, function(session) {
                if (session) reroute(session.id, false, true);
            });

        } else if (windowId) {
            performNewSessionSave(newName, windowId, function(session) {
                if (session) reroute(session.id, false, true);
            });
        }
        
    }

    function performSessionUpdate(newName, sessionId, callback) {

        chrome.runtime.sendMessage({
            action: 'updateSessionName',
            sessionName: newName,
            sessionId: sessionId
        }, callback);
    }

    function performNewSessionSave(newName, windowId, callback) {

        chrome.runtime.sendMessage({
            action: 'saveNewSession',
            sessionName: newName,
            windowId: windowId
        }, callback);
    }

    window.onload = function () {

        chrome.runtime.sendMessage({ action: 'requestAllSpaces' }, function (spaces) {

            spacesRenderer.initialise(8, true);
            spacesRenderer.renderSpaces(spaces);
            addEventListeners();
        });

        var simpleList = document.getElementById("savedSpaces")

        Sortable.create(simpleList, {
            animation: 300,  // ms, animation speed moving items when sorting, `0` — without animation
            //handle: ".my-handle", 
            onUpdate: function (evt) {
                var items = evt.target.getElementsByClassName('space'); 
                var space_order = [];
                Array.prototype.forEach.call(items, function(item, index) {
                    space_order.push([item.getAttribute("data-sessionid"), index]);                   
                });

                chrome.runtime.sendMessage({ action: 'updateSpaceOrder', order: space_order } );
            },
        });

    };
   

}());


