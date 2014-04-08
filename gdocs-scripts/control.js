/**
 * We make use of version 21 of the DocListExtended class from 
 * https://sites.google.com/site/scriptsexamples/new-connectors-to-google-services/driveservice
 * This has addCommenter and removeCommenter support
 */

var DOMAIN = 'opendatabarometer.org';
var CONTROLSHEET = '0ApqzJROt-jZ0dGxEZ1M0X2p2UW04amV6Zmw4VFFRQ3c';

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
      name: "Setup Answer Sheet",
      functionName: 'setupAnswerSheetHandler'
    },
    {
      name: "Refresh Sheets",
      functionName: 'refreshSheetHandler'
    }
  ];
  
  ass.addMenu("Actions", menuEntries);
}

/**
 * Return the survey URL for a particular answer sheet key
 */
function surveyUrl(key) {
  return 'http://w3f.com/' + key;
}

/**
 * Get participants for a particular survey row
 */
function getParticipants(row) {
  var ass = SpreadsheetApp.getActiveSpreadsheet();  
  var control = ass.getSheetByName('Control');
  
  return {
    coordinator: {
      name: control.getRange("K" + row).getValue(),
      emails: control.getRange("L" + row).getValue().split(/\s*,\s*/)
    },
    researcher: {
      name: control.getRange("M" + row).getValue(),
      emails: control.getRange("N" + row).getValue().split(/\s*,\s*/)
    },
    reviewer: {
      name: control.getRange("O" + row).getValue(),
      emails: control.getRange("P" + row).getValue().split(/\s*,\s*/)
    }
  };
}

/**
 * Fill out configuration for answer sheet
 */
function setupAnswerSheet(sheet, row) {
  // Active Spread Sheet. Yeesh.
  var ass = SpreadsheetApp.getActiveSpreadsheet();
  
  var cell = ass.getActiveCell();
  var control = ass.getSheetByName('Control');
  var country = control.getRange(row, 2).getValue();

  ass.toast(country, "Setting Answer sheet permissions...", -1);
  
  // Configure sharing
  var file = DriveApp.getFileById(sheet.getId());
  
  file.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.EDIT);
  
  file.setShareableByEditors(false);
  file.setDescription("Read-only answer sheet for " + country + ". Please do not access this sheet directly: instead, use the survey found at " + surveyUrl(sheet.getId()));
  
  var answerSheet = SpreadsheetApp.openById(sheet.getId());
  
  var editors = file.getEditors();
  
  // Remove all editors, re-add reviewer and researcher
  for(var i = 0; i < editors.length; i++) {
    try {
      answerSheet.removeEditor(editors[i]);
    }
    catch(e) {
      Logger.log("Well, I tried to remove " + editors[i].getName() + "...");
    }
  }
  
  var participants = getParticipants(row);
  
  answerSheet.addEditor(participants.coordinator.emails[0]);
  answerSheet.addEditor(participants.researcher.emails[0]);
  answerSheet.addEditor(participants.reviewer.emails[0]);

  // Set up Control sheet  
  var answerControl = sheet.getSheetByName('Control');

  ass.toast("Updating control...", country, -1);
  
  setValue(answerControl, 'Key', sheet.getId());
  setValue(answerControl, 'Country', country);
  
  ass.toast("Setting Reviewer in answer sheet...", country, -1);
  setValue(answerControl, 'Coordinator Name', participants.coordinator.name);
  setValue(answerControl, 'Coordinator Email', participants.coordinator.emails[0]);

  ass.toast("Setting Researcher in answer sheet...", country, -1);
  setValue(answerControl, 'Researcher', hex_md5(participants.researcher.emails[0]));
  
  ass.toast("Setting Reviewer in answer sheet...", country, -1);
  setValue(answerControl, 'Reviewer', hex_md5(participants.researcher.emails[0]));
  
  ass.toast("Setting Status in answer sheet...", country, -1);

  var states = loadStates();
  var stateLabel = control.getRange("E" + row).getValue();

  for(var state in states) {
    if(states[state].label == stateLabel) {
      setValue(answerControl, 'Status', state);
      break;
    }
  }

  var due = control.getRange("J" + row).getValue();
  if(due) {
    ass.toast("Setting Statue Due date in answer sheet...", country, -1);
    setValue(answerControl, 'Status Due', due);
  }

  ass.toast('Done');
}

/**
 * Iterate over rows selected when "Setup Answer Sheet" command is invoked
 */
function setupAnswerSheetHandler() {
  var ass = SpreadsheetApp.getActiveSpreadsheet();
  
  var range = ass.getActiveRange();
  var control = ass.getSheetByName('Control');

  if(range.getSheet().getSheetId() != control.getSheetId()) {
    Browser.msgBox('Please select a row in the "Control" spreadsheet.');
  }

  for(var i = range.getRow(); i <= range.getLastRow(); i++) {
    if(i == 1) {
      ass.toast("Can't operate on header row...");
      continue;
    }
  
    var country = control.getRange(i, 2).getValue();
    if(country == '') {
      ass.toast('There is no country for row ' + i);
      continue;
    }
    
    var answerSheetId = control.getRange("Q" + i).getValue();
    if(answerSheetId == '') {
      ass.toast('There is no Answer Sheet for ' + country + '.'); 
      continue;
    }
  
    var ss = SpreadsheetApp.openById(answerSheetId);
  
    if(!ss) {
      Browser.msgBox('Could not open Answer Sheet for ' + country);
      return;
    }
  
    setupAnswerSheet(ss, i);
  }
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
  
  for(var i = range.getRow(); i <= range.getLastRow(); i++) {
    if(i == 1) {
      ass.toast("Can't operate on header row...");
      continue;
    }

    var country = control.getRange(i, 2).getValue();
    if(country == '') {
      ass.toast("There is no country for row " + i);
      continue;
    }    
    
    if(control.getRange("Q" + i).getValue() != '') {
      ass.toast("Answer Sheet already exists", country);
      continue;
    }
    else {   
      ass.toast("Creating answer sheet", country, -1);

      var newSheet = ss.copy("WIS 2014 Answers - " + country);

      control.getRange("Q" + i).setValue(newSheet.getId());
      
      setupAnswerSheet(newSheet, i);
    }
  }
}

/**
 * Load all answer sheets
 */
function refreshSheetHandler() {
  var ass = SpreadsheetApp.getActiveSpreadsheet();

  var range = ass.getActiveRange();
  var control = ass.getSheetByName('Control');

  if(range.getSheet().getSheetId() != control.getSheetId()) {
    Browser.msgBox('Please select a range in the "Control" spreadsheet.');
  } 

  for(var i = range.getRow(); i <= range.getLastRow(); i++) {    
    if(i == 1) {
      ass.toast("Can't operate on header row...");
      continue;
    }
    
    var country = control.getRange(i, 2).getValue();
    
    if(country == '') {
      ass.toast("There is no country for row " + i);
      continue;
    }    

    var answerSheetKey = control.getRange("Q" + i).getValue();
    
    if(!answerSheetKey) {
      ass.toast("There is no answer sheet for row " + i, country);
      continue;
    }
    
    var answerSheet = SpreadsheetApp.openById(answerSheetKey);
    
    if(!answerSheet) {
      ass.toast("Could not open answer sheet", country);
      continue;
    }
    else {   
      refreshAnswerSheet(answerSheet, i);
    }
  }
}

/**
 * Load survey master table from master template
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
  
  var sectionSheet = surveyMaster.getSheetByName("Sections");
  var questionSheet = surveyMaster.getSheetByName("Questions");

  for(var i = 2; i <= sectionSheet.getMaxRows(); i++) {
    var sectionId = sectionSheet.getRange(i, 1).getValue();
    
    sectionOrder.push(sectionId);
    
    sections[sectionId] = {
      section: sectionSheet.getRange(i, 2).getValue(),
      questions: []
    };
  }
  
  for(var i = 2; i <= questionSheet.getMaxRows(); i++) {
    var sectionId = questionSheet.getRange(i, 1).getValue();
    
    if(!sectionId || !sections[sectionid]) {
      continue;
    }
    
    var questionId = questionSheet.getRange(i, 2).getValue();
    
    var question = {
      questionId: questionSheet.getRange(i, 2).getValue(),
      question: questionSheet.getRange(i, 3).getValue(),
      type: questionSheet.getRange(i, 4).getValue(),
      parentId: questionSheet.getRange(i, 5).getValue(),
    };
    
    question.section = sections[sectionId];
    
    sections[sectionId].questions.push(question);
    questions[questionId] = question;
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
      stateGrid = stateSheet.getRange(1, 1, stateSheet.getMaxRows(), 5).getValues(),
      states = {};
  
  for(var i = 1, row; i < stateGrid.length, row = stateGrid[i]; i++) {
    for(var j = 0; j < row.length; j++) {
      states[row[1]] = {
        label: row[0],
        state: row[1],
        description: row[2],
        actions: row[3],
        days: row[4]
      }
    }
  } 
  
  Logger.log("states: " + JSON.stringify(states));
  loadStates.states = states;
  
  return states;
}

/**
 * Load up the values in a Control sheet row
 */
function loadCountry(row) {
  if(loadCountry.cache[row]) {
    return loadCountry.states;
  }
  
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      control = ass.getSheetByName("Control"),
      columns = control.getRange(1, 1, 1, control.getMaxColumns()).getValues(),
      values = control.getRange(row, 1, 1, control.getMaxColumns()).getValues(),
      vals = {};
  
  for(var j = 0, column; j < columns[0].length, column = columns[0][j]; j++) {
    // Turn header wordsIntoCamelCase
    words = column.split(/\s+/);
	camelCase = '';
    
    words.map(function(w, i) {
      camelCase += (function(l) { return i > 0 ? l.charAt(0).toUpperCase() + l.slice(1) : l })(w.toLowerCase());
    });

    vals[camelCase] = values[0][j];
  }
  
  loadStates.cache[row] = vals;
  
  return vals;
}
loadCountry.cache = {};


/**
 * Refresh the answers from a particular answer sheet and update status.
 * If newStatus is falsy, then use status from answer sheet, otherwise override
 * with newStatus.
 */
function refreshAnswerSheet(sheet, i, newStatus) {
  var ass = SpreadsheetApp.getActiveSpreadsheet();
  var control = ass.getSheetByName('Control');

  var country = control.getRange(i, 2).getValue();

  ass.toast("Reading answer sheet", country);
  
  var answerControl = sheet.getSheetByName("Control"),
      answerControlValues = {},
      answerControlRange = answerControl.getRange(2, 1, answerControl.getMaxRows(), 2);
  
  for(var i = 0, row; i < answerControlRange.length, row = answerControlRange[i]; i++) {    
    answerControlValues[row[0]] = row[1];   
  }

  var states = loadStates(), statusChanged = false;

  // Force a new status on the control sheet
  if(newStatus) {
    setValue(answerControl, "Status", newStatus);
    statusChanged = newStatus;
  }
  // Read an updated status from the control sheet
  else if(states[answerControlValues['Status']].label != control.getRange(i, 5)) {
    control.getRange(i, 5).setValue(states[answerControlValues['Status']].label);
    statusChanged = answerControlValue['Status'];
  }
  
  if(statusChanged) {
    if(states[statusChanged].days) {
      // Go from today if no due date is set
      if(!dueDate) {
        dueDate = new Date();
      }
      var newDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() + states[statusChanged].days);
    
      // Status has changed, due date has not. Update due date.
      if(dueDate == answerControlValues['Status Due']) {
        setValue(answerControl, "Status Due", newDueDate.toDateString());
        control.getRange(i, 10).setValue(newDueDate.toDateString());        
      }
    }
    else {
      setValue(answerControl, "Status Due", '');
      control.getRange(i, 10).setValue('');
    }
  }
  
  var answers = sheet.getSheetByName("Answers");
  var master = loadSurveyMaster();
  var firstColumn = 21; // "U" first column in which answer counts appear
  var total;
  var answers = {}; // Count of answers by section
  
  for(var j = 2; j <= answers.getMaxRows(); j++) {
    var questionId = answers.getRange(j, 1).getValue();
    var question = master.questions[questionId];
  
    if(!question) {
      continue;
    }
    
    if(answers.getRange(j, 2) != '-') {
      answers[question.sectionId]++;
    }
  }
   
  for(var j = 0; j < master.sectionOrder.length; j++) {
    var sectionId = master.sectionOrder[j];    
    var total = section.questions.length;
    
    control.getRange(i, firstColumn + j).setValue(answers[sectionId]);

    if(answers[sectionId] == total) {
      control.getRange(i, firstColumn + j).setBackground("Green");
    }
    else {
      control.getRange(i, firstColumn + j).setBackground("Red");
    }    
  }
}

/**
 * Set a value in a configuration sheet
 */
function setValue(sheet, setting, value) {
  for(var i = 1; i <= sheet.getMaxRows(); i++) {
    if(sheet.getRange(i, 1).getValue() == setting) {
      sheet.getRange(i, 2).setValue(value);
    }
  }
}

/** 
 * Get a value from the configuration sheet
 */ 
function getConfig(variable) {
  var configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config");
  
  for(var i = 1; i < configSheet.getMaxRows(); i++) {
    if(configSheet.getRange(i+1,1).getValue() == variable) {
      return configSheet.getRange(i+1,2).getValue(); 
    }
  } 
}

/**
 * Gets the current date, or a date n days hence
 */ 
function getDeadline(days_to_add, text) {
  days_to_add = days_to_add || 0;
  
  var currentTime = new Date();
  var newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + days_to_add);
  var month = newTime.getMonth() + 1;
  var day = newTime.getDate();
  var year = newTime.getFullYear();
  
  if(text) {
    suffix = ["st","nd","rd","th","th","th","th","th","th","th","th","th","th","th","th","th","th","th","th","th","st","nd","rd","th","th","th","th","th","th","th","st"];
    month = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return day + suffix[day-1] + " " + month[newTime.getMonth()] + " " + year;
  } else {
    return day + "/" + month + "/" + year; 
  }
}

/** 
 * Get an e-mail account for this user
 *
 * email address of the user (Users can have multiple addresses, comma separated, but only the first is used)
 * By default if the e-mail address is not linked to an account we assign an account. To return false in these cases set no_assign=true
 *
 */ 
function getAccount(email,no_assign) {
  var configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Accounts");
  account = new Object();
  email = email.split(",").shift(); 
  
  //Search to see the the account is already set
  for(var i = 1; i < configSheet.getMaxRows(); i++) {
    if(configSheet.getRange(i+1,3).getValue() == email) {
      account.username = configSheet.getRange(i+1,1).getValue() + "@" + DOMAIN; 
      account.password = configSheet.getRange(i+1,2).getValue(); 
    }
  } 
  
  if(!account.username && !no_assign) {
    for(var i = 1; i < configSheet.getMaxRows(); i++) {
       if(!configSheet.getRange(i+1,3).getValue()) {
         configSheet.getRange(i+1,3).setValue(email);
         configSheet.getRange(i+1,4).setValue(getDeadline());
         account.username = configSheet.getRange(i+1,1).getValue() + "@" + DOMAIN; 
         account.password = configSheet.getRange(i+1,2).getValue();
         break;
       }
    }
  }
  
  if(account.username) {
    return account;
  } else {
    return false; 
  }
  
}

function archiveSheet(id, stage) {
    var folderID = getConfig("archive_folder");
    var sheet = DocsList.getFileById(id);
    var folder = DocsList.getFolderById(folderID);
    var copy = sheet.makeCopy("ARCHIVE ONLY: " + sheet.getName() + " - Stage " + stage + " - " + getDeadline());
    copy.addToFolder(folder);
}

function shareWithResearcher(sheetID,researcherEmail) {
  handbookID = getConfig("handbook");
  researcherAccount = getAccount(researcherEmail);
  
  
  var file = DriveApp.getFileById(sheetID);
  file.setShareableByEditors(false);
  file.addEditor(researcherAccount.username);

  try {
    var sheet = SpreadsheetApp.openById(sheetID); //Add error handling..
    //Protect the data sheet
    dataSheet = sheet.getSheetByName("Data");
    permissions = dataSheet.getSheetProtection();
    permissions.setProtected(true);
    dataSheet.setSheetProtection(permissions);
    
    //Protect the dashboard
    dataSheet = sheet.getSheetByName("Dashboard");
    permissions = dataSheet.getSheetProtection();
    permissions.setProtected(true);
    dataSheet.setSheetProtection(permissions);
  } catch(e) { 
    Logger.log(e);
  } 
  
  var handbook = DocsList.getFileById(handbookID);
  handbook.addViewer(researcherAccount.username);
}

/** 
 * Share the sheet with the reviewer
 */ 
function shareWithReviewer(sheetID,reviewerEmail,countrycode) {
  handbookID = getConfig("handbook");
  reviewerAccount = getAccount(reviewerEmail);
  //We need to remove the Researcher Information sheet - and copy this information to a master document.
  //We need to remove the Researcher
  //We need to grant comment permissions to the reviewer
  
  //var file = DocsList.getFileById(sheetID);
  var file = DriveApp.getFileById(sheetID);
  
  //file.addEditor(reviewerAccount.username);
  file.addEditor(reviewerAccount.username);
  
  var handbook = DocsList.getFileById(handbookID);
  handbook.addViewer(reviewerAccount.username); 
}

/**
 * Refresh data from all active survey spreadsheets periodically. 
 * Use "Last Updated" column to track when a survey was last refreshed.
 * Only perform refresh operation if the survey sheet was updated after this timestamp.
 */
function hourlyUpdate(event) {

}
 
/**
 * Handle changes to the status column to move the sheet through the different processes
 */
function onUpdate(event) {
  // Only pay attention to changes on "Status" column
  if(event.range.getColumn() != 5 || event.range.getRow() == 1 || event.source.getSheetName() != "Control" || !event.value) {
    return;
  }
  
  var states = loadStates(),
      row = event.range.getRow(),
      ass = SpreadsheetApp.getActiveSpreadsheet(),
      state = event.value,
      status;
  
  Logger.log(JSON.stringify(states) + " , " + state);
  // Pull state slug out of StatusList sheet  
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
      vals = loadCountry(row);

  // De-aggregate email addresses
  vals.coordinatorEmail = vals.coordinatorEmail.split(/\s*,\s*/);
  vals.researcherEmail = vals.researcherEmail.split(/\s*,\s*/);
  vals.reviewerEmail = vals.reviewerEmail.split(/\s*,\s*/);
                                                
  // And then some additional subs
  vals.surveyUrl = getConfig('survey_url') + vals.answerSheet;
  
  Logger.log("vals: " + JSON.stringify(vals));
  
  // Sanity checks. Don't do anything for reset
  if(state == 'recruitment') {
    Logger.log("State moved to recruitment. Nothing happened!");
    return;
  }
  
  if(vals.answerSheet == '') {
    Browser.msgBox("No answer sheet for this country yet. Please assign an answer sheet first.");
    
    control.getRange(row, 5).setValue(states.recruitment.label);
    return;
  }
  
  if(vals.researcherEmail[0] == '') {
    Browser.msgBox("No researcher google address found for the researcher yet. Please assign a researcher first.");
    control.getRange(row, 5).setValue(states.recruitment.label);
    return;
  }
  
  // Get email of current user for saving notes
  var userEmail = Session.getUser().getEmail();
  
  var notes = control.getRange(row, 5).getNote().split("\n---\n").map(function(note) {
    var matches = note.match(/^(\w+) (.+) \| (.+): ([\s\S]+)$/);
    
    return {
      status: matches[1],
      date: matches[2],
      party: matches[3],
      note: matches[4]
    };
  });
  
  // Log activities in notes on 'Status' field. Use history to direct logic
  function addNote(message) {    
    var date = new Date();
    
    notes.unshift({
      status: status,
      date: date.toDateString() + ' ' + date.toTimeString(),
      party: userEmail,
      message: message
    });
    
    control.getRange(row, 5).setNote(notes.map(function(note) {
      return note.status + ' ' + note.date + ' | ' + note.party + ':' + note.message;      
    }).join("\n---\n"));
  }

  switch(status) {
    case 'recruit':
      addNote("Placed into recruitment mode");
      
      break;
      
    // Research
    case 'assigned':
      var time_limit = 7; // Allow 7 days for research
      
      vals.deadline = getDeadline(time_limit, true);
      
      // Notify
      mailAlert('research', vals, v);
      
      ass.toast("Shared sheet with Researcher " + vals.researcherName, country);
      
      //Set deadline value
      control.getRange(row, 10).setValue(getDeadline(time_limit));
      
      //Log
      addNote("Assigned to " + vals.researcherName + " <" + vals.researcherEmail + "> with deadline " + vals.deadline);
      
      break;
      
    // Spot check
    case 'spotcheck':
      archiveSheet(vals.answerSheet, status);
      
      // Log
      addNote("Spot check by " + vals.coordinatorName);
      
      // Mail
      mailAlert('spotcheck', vals);
      
      break;
      
    // Clarifications requested
    case 'clarification':   
      var time_limit = 3;
      
      vals.deadline = getDeadline(time_limit, true);
      
      control.getRange(row, 10).setValue(getDeadline(time_limit));
      
      // Add note to history
      addNote("Requested clarifications from " + vals.researcherName);
      
      // We may have already done a round of clarification. If so, set clarification_again email
      // instead
      var clarifications = notes.filter(function(note) {
        return note.status == 'clarification';
      });
      
      if(clarifications.length > 1) {
        mailAlert('clarification_again', vals);
      }
      else {
        mailAlert('clarification', vals);
      }
      
      // Alert
      ass.toast("A mail has been sent to the researcher. You are cc in. Follow up with additional detail if required", "Requesting clarification");
      break;
      
    // Review
    case 'review':
      var time_limit = 5;

      if(!vals.reviewerName || !vals.reviewerEmail[0]) {
        Browser.msgBox("No Reviewer email provided for " + vals.country, "Error");
        return;
      }
      
      // Set next deadline
      control.getRange(row,10).setValue(getDeadline(time_limit));

      // Add note to history
      addNote("Sent for review to " + vals.reviewerName);
      
      // We may have already done a round of review. If so, set review_again email
      // instead
      var reviews = notes.filter(function(note) {
        return note.status == 'review';
      });
      
      if(reviews.length > 1) {
        mailAlert('review_again', vals);
      }
      else {
        mailAlert('review', vals);
      }

      archiveSheet(vals.answerSheet, 'Review' + (reviews.length ? ' #' + reviews.length : ''));
        
      //Send mail 
      mailAlert('review', vals);
          
      //Alert
      ass.toast("Moved survey to Review mode to be reviewed by " + vals.reviewerName, vals.country);
      
      break;
      
    // Validation
    case 'validation':
      // Log
      addNote("Post-review validation by " + vals.coordinatorName);
      
      // Mail
      mailAlert('validation', vals);
      
      break;
     
    case 'complete':
      // Log
      addNote("Set as complete by " + vals.coordinatorName);
      
      //Send mail
      mailAlert('researcher_complete', vals);
      mailAlert('reviewer_complete', vals);
      
      //Clear deadline
      control.getRange(row, 10).setValue("Completed");
      
      //Alert
      ass.toast("Mail sent to researcher and reviewer.","Completed " + vals.country);
      
      break;
      
    default:
      ass.toast("Unknown status - " + status, "Updating status");  
      break;
  }
}

/*
 * Mail messages. Accept various substitutions in the form of %sub% in the 
 * subject or body of the email. 
 */
function mailAlert(status, subs) {
  var emailSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Emails");
  var email;
  
  for(var i = 2; i <= emailSheet.getMaxRows(); i++) {
    if(emailSheet.getRange(i,1).getValue() == status) {
      email = {
        // Recipients are separated and interpreted with substitution vars and sent literally
        recipients: emailSheet.getRange(i,2).getValue(),
        subject: emailSheet.getRange(i,3).getValue(),
        body: emailSheet.getRange(i,4).getValue(),
        // Attachments are references to keys defined in "Config" sheet
        attachments: emailSheet.getRange(i,5).getValue().split(',')
      }
    }
  }

  if(!email) {
    return;
  }
  
  // Replace substitution vars
  ['recipients', 'subject', 'body'].map(function(s) {
    var body = email[s];
    
    for(var sub in subs) {
      body = body.replace('%' + sub + '%', subs[sub]);
    }
    
    email[s] = body;
  });
 
  MailApp.sendEmail({
    to: email.recipients,
    cc: subs.coordinatorEmail,
    subject: email.subject,
    name: "The Web Index Survey",
    replyTo: subs.coordinatorEmail,
    body: email.body,
    // Turn comma-separated attachment config vars, which are just file IDs, into PDFs
    attachments: email.attachments.map(function(attachment_var) {
      return DocsList.getFileById(getConfig(attachment_var)).getAs(MimeType.PDF);
    })
  });
}

/**
 * Try to access all of the required resources
 */
function authorise() {
  masterSheetID = getConfig("master_sheet");
  handbook = getConfig("handbook");
  folderID = getConfig("folder");
  DriveApp.getFileById(masterSheetID);
  DocsList.getFileById(masterSheetID);
  DocsList.getFileById(handbook);
  DocsList.getFolderById(folderID);
}

