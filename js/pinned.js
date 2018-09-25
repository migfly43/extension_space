'use strict';
chrome.windows.onFocusChanged.addListener(onFocusChangedX)

/**
 * @function onFocusChangedX
 * @param {Number} windowId
 */
function onFocusChangedX(windowId) {
  if (windowId <= 0)
    return;

  chrome.windows.get(windowId, {windowTypes: ['normal']}, movePinnedTabs);
}


/**
 * @function movePinnedTabs
 * @param {Window} window
 */
function movePinnedTabs(window) {
  chrome.tabs.query({pinned: true}, tabs => {
    if (!tabs.length)
      return;

    sortTabsByIndex(tabs).forEach((tab, index) => {
      chrome.tabs.move(tab.id, {windowId: window.id, index}, makePinned);
    });
  });
}

/**
 * @function sortTabsByIndex
 * @param {Tab[]} tabs
 */
function sortTabsByIndex(tabs) {
  return tabs.sort((first, second) => {
    if (first.index < second.index)
      return -1;
    else if (first.index > second.index)
      return 1;

    return 0;
  });
}

/**
 * @function makePinned
 * @param {Tab} tab
 */
function makePinned(tab) {
  if (chrome.runtime.lastError)
    return;

  [].concat(tab).forEach(tab => chrome.tabs.update(tab.id, {pinned: true}));
}
