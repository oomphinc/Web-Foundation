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
 * Handle changes to the status column to move the sheet through the different processes,
 * synchronize accordingly
 */
function onUpdate(event) {  
  // Get sheet headers for duck-typing the sheet (Don't getSheetName() == 'Control' because the call is VERY slow)
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      control = ass.getSheetByName('Control'),
      as = ass.getActiveSheet(),
      headers = (as.getRange(1, 1, 1, 10).getValues())[0],
      column = headers[event.range.getColumn()-1],
      row = event.range.getRow(),
      value = event.value,
      country = loadCountry(row),
      states, status, state, ss;
  
  // Only pay attention to changes on 'Synchronize?' and 'Current Status' columns
  if(column != 'Synchronize?' && column != 'Current Status' || row == 1) {
    return;
  }
 
  // For changes to "Synchronize?" field...
  if(column == 'Synchronize?') {
    if(value != 'Do it!') {
      return;
    }
      
    // Reset the field
    control.getRange("C" + country.row).setValue("Synchronize...");
    
    if(!country.answerSheet) {
      // Nothing to synchronize!
      return;
    }
  }
    
  // For changes to  "Current Status" field, override the state
  if(column == 'Current Status' && value) {
    // Sanity checks. Don't do anything for reset
    states = loadStates();
    
    if(!states.recruitment) {
      Browser.msgBox("Can't find initial `recruitment` state.");
      return;
    }
    
    for(status in states) {
      if(states[status].label == value) {
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
    
    if(country.answerSheet == '') {    
      // Make an answer sheet if there isn't one
      if(state != 'recruitment') {
        createAnswerSheet(country);
      }
      else {
        // Don't create answer sheets when moving to recruitment
        return;
      }
    }
  }
      
  ss = SpreadsheetApp.openById(country.answerSheet);
  
  if(!ss) {
    Browser.msgBox('Could not open Answer Sheet for ' + country.name + '.');
    return;
  }
  
  refreshAnswerSheet(country);
  setupAnswerSheet(country, ss);
}

