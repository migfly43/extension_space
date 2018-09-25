/*global chrome */

(function () {

    'use strict';

    var globalCurrentSpace;

    function renderSpaceInfo() {
        document.getElementById('activeSpaceTitle').innerHTML = globalCurrentSpace.name ? globalCurrentSpace.name : '(unnamed window)';
        document.getElementById('activeSpaceTitle').setAttribute("windowId",  globalCurrentSpace.windowId);

        if(globalCurrentSpace.checkClose=="false"){          
            document.getElementById("closeYNLink").querySelector("i").classList.toggle('fa-check-square');
            document.getElementById("closeYNLink").querySelector("i").classList.toggle('fa-square');
        }
    }

    function renderHotkeys() {
        chrome.extension.getBackgroundPage().spaces.requestHotkeys(function (hotkeys) {
            document.querySelector('#switcherLink .hotkey').innerHTML = hotkeys.switchCode ? hotkeys.switchCode : 'no hotkey set';
            document.querySelector('#moverLink .hotkey').innerHTML = hotkeys.moveCode ? hotkeys.moveCode : 'no hotkey set';
        });
    }

    function addEventListeners() {

        var hotkeyEls = document.querySelectorAll('.hotkey');
        for (var i = 0; i < hotkeyEls.length; i++) {
            hotkeyEls[i].addEventListener('click', function (e) {
                chrome.runtime.sendMessage({
                        action: 'requestShowKeyboardShortcuts'
                    });
                window.close();
            });
        }

        document.querySelector('#allSpacesLink .optionText').addEventListener('click', function (e) {
            chrome.runtime.sendMessage({
                    action: 'requestShowSpaces'
                });
            window.close();
        });

        /*document.querySelector('#switcherLink .optionText').addEventListener('click', function (e) {
            chrome.runtime.sendMessage({
                    action: 'requestShowSwitcher'
                });
            window.close();
        });*/

        document.querySelector('#addSpacesLink .optionText').addEventListener('click', function (e) {

            if( !document.querySelector('#addSpace_container') ){
                var addSpace_container = document.createElement('div'),
                addSpace_input = document.createElement("input"),
                addSpace_add = document.createElement("button"),
                addSpace_cancel = document.createElement("button");
             
                addSpace_container.setAttribute("id", "addSpace_container");

                addSpace_input.setAttribute("type", "text");
                addSpace_input.setAttribute("placeholder", "Space Name ... ");

                addSpace_add.setAttribute("class", "add");
                addSpace_cancel.setAttribute("class", "cancel");
                addSpace_add.innerText = "Add";
                addSpace_cancel.innerText = "Cancel";

                addSpace_container.append(addSpace_input);
                addSpace_container.append(addSpace_add);
                addSpace_container.append(addSpace_cancel); 

                addSpace_add.onclick = function(){
                    chrome.runtime.sendMessage({
                            action: 'addSapce',
                            spacename: addSpace_input.value,
                            oldSessionId: globalCurrentSpace.sessionId,
                            oldWindowId: globalCurrentSpace.windowId
                        });
                    
                    var addSpace_container = document.querySelector('#addSpace_container');
                    addSpace_container.parentNode.removeChild(addSpace_container); 
                }
                addSpace_cancel.onclick = function(){
                    var addSpace_container = document.querySelector('#addSpace_container');
                    addSpace_container.parentNode.removeChild(addSpace_container);  
                }

                addSpace_container.onkeyup = function(e){
                    if (e.keyCode === 13) {
                        addSpace_add.click();                        
                    }else if(e.keyCode === 27){
                        addSpace_cancel.click();
                    }
                }

                this.parentNode.parentNode.insertBefore(addSpace_container, this.parentNode.nextSibling) ; 
            }             
                       
        });        

        document.querySelector('#moverLink .optionText').addEventListener('click', function (e) {
            chrome.runtime.sendMessage({
                    action: 'requestShowMover'
                });
            window.close();
        });

        document.querySelector('#closeYNLink .optionText').addEventListener('click', function (e) {
            document.getElementById("closeYNLink").querySelector("i").classList.toggle('fa-check-square');
            document.getElementById("closeYNLink").querySelector("i").classList.toggle('fa-square');

            var checkClose = false;
            if( document.getElementById("closeYNLink").querySelector("i").classList.contains("fa-check-square") ){
                checkClose = true;
            }

            chrome.runtime.sendMessage({
                    action: 'requestCheckClose',
                    checkClose: checkClose,
                    activeWindowId : document.getElementById('activeSpaceTitle').getAttribute("windowId")
                });
          
        });

        document.getElementById('spaceEdit').addEventListener('click', function (e) {
            chrome.runtime.sendMessage({
                    action: 'requestShowSpaces',
                    windowId: globalCurrentSpace.windowId,
                    edit: true
                });
            window.close();
        });

    }

    document.addEventListener('DOMContentLoaded', function () {

        chrome.extension.getBackgroundPage().spaces.requestCurrentSpace(function (space) {

            globalCurrentSpace = space;            

            renderSpaceInfo();
            renderHotkeys();
            addEventListeners();
        });
    });

}());
