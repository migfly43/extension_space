/*Windows Risize*/
window.onresize = function(event) {

   	chrome.runtime.sendMessage({
        action: 'resizeWindow',
        position: {screenX:window.screen.width , screenY: window.screen.height, top:window.screenX, left:window.screenY}
    });

};

