/**
 * W3F Web Index Survey - Data Aggregation Script
 *
 * Copyright (C) 2014 Tim Davies at the Web Foundation
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

/**
 * This script reads through the control sheet, and fetches into the 'data' tab of the spreadsheet
 * it is attached to, all the results from each sheet.
 *
 * It can also be used to fetch notes
 *
 * To configure - replace ADD CONTROL SHEET ID HERE with the spreadsheet key of the control sheet it used with.
 *
 */


function fetchData() {
 writeSS = SpreadsheetApp.getActiveSpreadsheet()
 writeSheet = writeSS.getSheetByName("Data")
 controlSS = SpreadsheetApp.openById("ADD CONTROL SHEET ID HERE")
 sheet = controlSS.getSheetByName('Control'); 
 n = 2
 
 for(row = 2; row < controlSS.getLastRow(); row ++) {
   var country = sheet.getRange(row, 2).getValue();
   var countrySheetID = sheet.getRange(row, 17).getValue();
    
   if(countrySheetID) {
     controlSS.toast(countrySheetID)
     countrySS = SpreadsheetApp.openById(countrySheetID)
     countrySheet = countrySS.getSheetByName("Answers")
     countryData = countrySheet.getRange(2,1,countrySheet.getLastRow(),countrySheet.getLastColumn()).getValues()
     writeSheet.getRange(n,2,countryData.length,countryData[0].length).setValues(countryData)
     writeSheet.getRange(n,1,countryData.length,1).setValue(country)
     n = n + countryData.length
   }
   
 
    controlSS.toast(country);
 }
     
}

function menuFetchData() {
   var ui = SpreadsheetApp.getUi(); // Same variations.

  var result = ui.alert(
     'Please confirm',
     'This operation may take up to 30 minutes to complete before all formulae are recalculated. Please check if anyone else is currently using the sheet and alert them that you are refreshing data.',
      ui.ButtonSet.YES_NO);

  // Process the user's response.
  if (result == ui.Button.YES) {
    // User clicked "Yes".
    fetchData()
  } else {
    // User clicked "No" or X in the title bar.
    ui.alert('Update postponed. The normal scheduled update will still take place.');
  }

  
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  // Or DocumentApp or FormApp.
  ui.createMenu('Web Index Tools')
      .addItem('Update Data', 'menuFetchData')
      .addToUi();
}



function fetchNotes() {
 writeSS = SpreadsheetApp.getActiveSpreadsheet()
 writeSheet = writeSS.getSheetByName("Notes")
 controlSS = SpreadsheetApp.openById("ADD CONTROL SHEET ID HERE")
 sheet = controlSS.getSheetByName('Control'); 
 n = 2
 
 for(row = 2; row < controlSS.getLastRow(); row ++) {
   var country = sheet.getRange(row, 2).getValue();
   var countrySheetID = sheet.getRange(row, 17).getValue();
    
   if(countrySheetID) {
     controlSS.toast(countrySheetID)
     countrySS = SpreadsheetApp.openById(countrySheetID)
     countrySheet = countrySS.getSheetByName("Notes")
     countryData = countrySheet.getRange(2,1,countrySheet.getLastRow(),countrySheet.getLastColumn()).getValues()
     writeSheet.getRange(n,2,countryData.length,countryData[0].length).setValues(countryData)
     writeSheet.getRange(n,1,countryData.length,1).setValue(country)
     n = n + countryData.length
   }
   
 
    controlSS.toast(country);
 }
     
}
