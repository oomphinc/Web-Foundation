/**
 * W3F Web Index Survey - Spreadsheet Data Loaders
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

/**
 * Load table data from a grid into an array of objects using camelCasedHeaders as key names.
 * If key is defined, it represents a camelCased header for the column to use as a key, and an
 * object will be returned instead.
 */
function loadTableData(sheet, key) {
  var values = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).getValues(),
      headers = [],
      result = key ? {} : [];
  
  for(var i = 0, column; i < values[0].length, column = values[0][i]; i++) {
    // Turn header wordsIntoCamelCase
    words = column.split(/\s+/);
	camelCase = '';
    
    words.map(function(w, i) {
      camelCase += (function(l) { return i > 0 ? l.charAt(0).toUpperCase() + l.slice(1) : l })(w.toLowerCase());
    });

    headers.push(camelCase);
  }
  
  // Populate from the rest of the data values
  for(var i = 1; i < values.length; i++) {
    var row = {};
    
    for(var j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j];
    }
    
    row.row = i+1; // Because the spreadsheet table is 1-indexed
    
    if(key) {
      result[row[key]] = row;
    }
    else {
      result.push(row);
    }
  }
  
  return result;
}

/**
 * Load key/value data from a sheet using the first column as key and second
 * column as values
 */
function loadKVData(sheet) {
  var values = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).getValues(),  
      result = {};
  
  for(var i = 0; i < values.length; i++) {
    result[values[i].shift()] = values[i];
  }
    
  return result;
}

/**
 * Load survey master table from master template. Cache result
 * since it should never change during a run and is a big calculation
 */
function loadSurveyMaster() {
  if(loadSurveyMaster.master) {
    return loadSurveyMaster.master;
  }
  
  var sectionOrder = [], sections = {}, questions = {};
  
  var surveyMasterKey = getConfig('master_sheet');
  var surveyMaster = SpreadsheetApp.openById(surveyMasterKey);

  if(!surveyMaster) {
    return;
  }
  
  // Load sections
  var sectionSheet = surveyMaster.getSheetByName("Sections"),
      sections = loadKVData(sectionSheet),
      sectionOrder;
  
  for(section in sections) {
    sectionOrder.push(section);
    
    sections[section] = {
      section: sections[section][0],
      questions: []
    };
  }

  // Load questions
  var questionSheet = surveyMaster.getSheetByName("Questions"),
      questionData = loadTableData(questionSheet),
      questions = {};

  for(var i in questionData) {
    var question = questionData[i];
    
    // Skip questions with an unknown / invalid section ID
    if(!sections[question.sectionId]) {
      continue;
    }
    
    question.section = sections[question.sectionId];
    questions[question.questionId] = question;
    sections[question.sectionId].questions.push(question);
  }
  
  loadSurveyMaster.master = {
    sectionOrder: sectionOrder,
    sections: sections,
    questions: questions
  };
  
  return loadSurveyMaster.master;
}

/**
 * Load a map of the valid states
 */
function loadStates() {  
  if(loadStates.states) {
    return loadStates.states;
  }
  
   // Pull state slug out of StatusList sheet
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      stateSheet = ass.getSheetByName("StatusList"),
      stateData = loadKVData(stateSheet),
      states = {};
  
  for(var state in stateData) {
    var row = stateData[state];
    
    if(!state) {
      continue;
    }
    
    states[row[0]] = {
      label: state,
      state: row[0],
      description: row[1],
      actions: row[2],
      days: row[3]
    }
  } 
  
  loadStates.states = states;
  
  return states;
}

/**
 * Return data for all countries in control sheet 
 */
function loadCountries() {
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      control = ass.getSheetByName("Control");
  
  return loadTableData(control);      
}

/**
 * Load the data for a particular country
 */
function loadCountry(row) {
  var countries = loadCountries();
  
  return countries[row-2];
}

