/**
 * W3F Web Index Survey - Control Spreadsheet Event Handlers
 *
 * Copyright (C) 2014  Ben Doherty @ Oomph, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/***
 ** EVENT HANDLERS FOR MENU ACTIONS AND CRONJOBS
 ***/

/**
 * Add menu to execute functions
 */
function onOpen() {
  var ass = SpreadsheetApp.getActiveSpreadsheet();
  var menuEntries = [
    {
      name: "Create Answer Sheet",
      functionName: "createAnswerSheetHandler"
    },
    {
      name: "Synchronize Answer Sheet",
      functionName: 'synchronizeAnswerSheetHandler'
    }
  ];
  
  ass.addMenu("Actions", menuEntries);
}


/**
 * Create new Answer sheet from Answer template. 
 */
function createAnswerSheetHandler() {
  var ass = SpreadsheetApp.getActiveSpreadsheet();
  var answerSheet = getConfig('answer_template');
  
  var range = ass.getActiveRange();
  var control = ass.getSheetByName('Control');

  if(range.getSheet().getSheetId() != control.getSheetId()) {
    Browser.msgBox('Please select a row in the "Control" spreadsheet.');
  } 

  var ss = SpreadsheetApp.openById(answerSheet);
  
  if(!ss) {
    Browser.msgBox("Couldn't open answer sheet template with key=" + answerSheet);
    return;
  }
  
  if(range.getRow() == 1) {
    Browser.msgBox("Can't operate on header row.");
    return;
  }

  var firstRow = range.getRow(),
      countries = loadCountries();
  
  for(var i = range.getRow(); i <= range.getLastRow(); i++) {
    var country = countries[i-2];
    
    if(country.answerSheet != '') {
      ass.toast("Answer Sheet already exists", country.name);
      continue;
    }
    else {
      ass.toast("Creating answer sheet", country.name, -1);

      var folderID = getConfig("folder");
      var folder = DriveApp.getFolderById(folderID);

      var newSheet = ss.copy("WIS 2014 Answers - " + country.name);

      control.getRange("Q" + country.row).setValue(newSheet.getId());

      var file = DriveApp.getFileById(newSheet.getId());
      
      folder.addFile(file);
      
      setupAnswerSheet(country, newSheet);
      shareAnswerSheet(country, newSheet);
    }
  }
}

/**
 * Iterate over rows selected when "Synchronous Answer Sheet" command is invoked, Refresh
 * sheet then set up
 */
function synchronizeAnswerSheetHandler() {
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      range = ass.getActiveRange();
  
  if(range.getRow() == 1) {
    ass.toast("Can't operate on header row...");
    return;
  }
  
  var control = ass.getSheetByName('Control');

  if(range.getSheet().getSheetId() != control.getSheetId()) {
    Browser.msgBox('Please select a row in the "Control" spreadsheet.');
  }
  
  var countries = loadCountries();
  
  for(var i = range.getRow(); i <= range.getLastRow(); i++) {
    var country = countries[i - 2];
    
    if(!country) {
      ass.toast('There is no country for row #' + i);
      continue;
    }
    
    if(country.answerSheet == '') {
      ass.toast('There is no Answer Sheet for ' + country.name + '.'); 
      continue;
    }
  
    var ss = SpreadsheetApp.openById(country.answerSheet);
  
    if(!ss) {
      Browser.msgBox('Could not open Answer Sheet for ' + country.name + '.');
      return;
    }
  
    refreshAnswerSheet(country);
    setupAnswerSheet(country, ss);
  }
  
  ass.toast("Done setting up answer sheets.");
}


/**
 * Refresh data from all active survey spreadsheets periodically.
 * Use "Last Updated" column to track when a survey was last refreshed.
 * Only perform refresh operation if the survey sheet was updated after this timestamp.
 */
function periodicUpdate(event) {
  var states = loadStates(),
      countries = loadCountries();
  
  for(var i = 0, country; i < countries.length, country = countries[i]; i++) {
    if(country.answerSheet && country.currentStatus != states.complete.label) {
      refreshAnswerSheet(country);
    }
  }
}
 
/**
 * Handle changes to the status column to move the sheet through the different processes
 */
function onUpdate(event) {  
  // Get sheet headers for duck-typing the sheet (Don't getSheetName() == 'Control' because the call is VERY slow)
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      as = ass.getActiveSheet(),
      headers = (as.getRange(1, 1, 1, 10).getValues())[0],
      status;
  
  // Only pay attention to changes on "Current Status" field
  if(headers[event.range.getColumn()-1] != 'Current Status' || event.range.getRow() == 1 || !event.value) {
    return;
  }

  var state = event.value;
  
  // Sanity checks. Don't do anything for reset
  var states = loadStates();

  if(!states.recruitment) {
    Browser.msgBox("Can't find initial `recruitment` state.");
    return;
  }
  
  for(status in states) {
    if(states[status].label == state) {
      // Get state object and key
      state = status;
      status = states[status];
      break;
    }
  }
  
  if(typeof status != "object") {
    Browser.msgBox("Couldn't find associated status for state " + state);
    return;
  }
  
  var control = ass.getSheetByName('Control'),
      row = event.range.getRow(),
      country = loadCountry(row);
  
  if(state != 'recruitment' && country.answerSheet == '') {
    Browser.msgBox("No answer sheet for this country yet. Please assign an answer sheet first.");
    
    control.getRange(row, 5).setValue(states.recruitment.label);
    return;
  }
  
  // Refresh the answer sheet
  refreshAnswerSheet(country, state);
}

