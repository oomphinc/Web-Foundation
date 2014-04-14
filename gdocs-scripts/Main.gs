/**
 * W3F Web Index Survey - Google Spreadsheets POST proxy
 *
 * Copyright (C) 2014  Ben Doherty @ Oomph, Inc., and Tim Davies at the Web Foundation
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
 * We make use of version 21 of the DocListExtended class from 
 * https://sites.google.com/site/scriptsexamples/new-connectors-to-google-services/driveservice
 * This has addCommenter and removeCommenter support
 */

var DOMAIN = 'webfoundation.org';

/**
 * Return the survey URL for a particular answer sheet key
 */
function surveyUrl(key) {
  return 'http://survey.thewebindex.org/' + key;
}

/**
 * Get participants for a country
 */
function getParticipants(country) {
  return {
    coordinator: {
      name: country.coordinatorName,
      emails: country.coordinatorEmail.split(/\s*,\s*/)
    },
    researcher: {
      name: country.researcherName,
      emails: country.researcherEmail.split(/\s*,\s*/)
    },
    reviewer: {
      name: country.reviewerName,
      emails: country.reviewerEmail.split(/\s*,\s*/)
    }
  };
}

/**
 * Fill out configuration for answer sheet
 */
function setupAnswerSheet(country, sheet) {
  // Active Spread Sheet. Yeesh.
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      control = ass.getSheetByName('Control');

  ass.toast("Setting Answer sheet permissions...", country.name, -1);
  
  // Configure sharing. Make private, add editors, make DOMAIN-accessible.
  var file = DriveApp.getFileById(sheet.getId());
  
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
  
  file.setShareableByEditors(false);
  file.setDescription("Read-only answer sheet for " + country.name + ". Please do not access this sheet directly: instead, use the survey found at " + surveyUrl(sheet.getId()));
  
  var editors = sheet.getEditors();
  
  // Remove all editors, re-add reviewer and researcher
  for(var i = 0; i < editors.length; i++) {
    try {
      sheet.removeEditor(editors[i]);
    }
    catch(e) {
      Logger.log("Well, I tried to remove " + editors[i].getName() + "...");
    }
  }
  
  var participants = getParticipants(country);
  
  Logger.log("participants: " + JSON.stringify(participants));
  
  for(var role in participants) {
    try {
      sheet.addEditor(participants[role].emails[0]);
    }
    catch(e) {
      ass.toast("Failed to add editor for role `" + role + "`: " + e);
    }
  }

  file.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.EDIT);
  
  // Set up Control sheet  
  var answerControl = sheet.getSheetByName('Control');

  ass.toast("Updating control...", country.name, -1);
  
  setValue(answerControl, 'Key', sheet.getId());
  setValue(answerControl, 'Country', country.name);
  
  ass.toast("Setting Reviewer in answer sheet...", country.name, -1);
  setValue(answerControl, 'Coordinator Name', participants.coordinator.name);
  setValue(answerControl, 'Coordinator Email', participants.coordinator.emails[0]);

  ass.toast("Setting Researcher in answer sheet...", country.name, -1);
  setValue(answerControl, 'Researcher', hex_md5(participants.researcher.emails[0]));
  
  ass.toast("Setting Reviewer in answer sheet...", country.name, -1);
  setValue(answerControl, 'Reviewer', hex_md5(participants.reviewer.emails[0]));
  
  ass.toast("Setting Status in answer sheet...", country.name, -1);

  var states = loadStates();
  var stateLabel = control.getRange("E" + country.row).getValue();

  for(var state in states) {
    Logger.log("trying to compare " + stateLabel + " against " + states[state].label);
    if(states[state].label == stateLabel) {
      setValue(answerControl, 'Status', state);
      break;
    }
  }

  var due = control.getRange("J" + country.row).getValue();
  if(due) {
    ass.toast("Setting Statue Due date in answer sheet...", country.name, -1);
    setValue(answerControl, 'Status Due', due);
  }

  ass.toast('Done', country.name);
}


/**
 * Refresh the answers from a particular answer sheet and update status.
 * If newStatus is falsy, then use status from answer sheet, otherwise override
 * with newStatus.
 */
function refreshAnswerSheet(country, newStatus) {
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      control = ass.getSheetByName('Control');

  if(!country.answerSheet) {
    ass.toast("No answer sheet found", country.name);
    return;
  }
  
  var answers = SpreadsheetApp.openById(country.answerSheet);
  
  if(!answers) {
    ass.toast("Could not open answer sheet", country.name);
    return;
  }
  
  ass.toast("Refreshing answer sheet", country.name, -1);
  
  // Load control values from answer sheet
  var answerControlSheet = answers.getSheetByName("Control"),
      answerControlValues = loadKVData(answerControlSheet),
      states = loadStates(),
      statusChanged = false,
      answerStatus = answerControlValues['Status'][0],
      answerDue = answerControlValues['Status Due'][0];
  
  // Force a new status on the answer sheet (by updating master control sheet)
  if(newStatus) {
    setValue(answerControlSheet, "Status", newStatus);
    statusChanged = newStatus;
  }
  
  // Reset status to what's in master control sheet if the answer control sheet specifies an invalid one
  else if(!states[answerStatus]) {
    ass.toast("Invalid status (" + answerStatus + ") found in answer control sheet. Resetting to " + country.currentStatus);
    
    // Ugh, turn status label into a state slug to use in answer sheet
    for(var state in states) {
      if(states[state].label == country.currentStatus) {
        setValue(answerControl, "Status", state);
      }
    }
  }
  
  // Update status in master control sheet if answer control status has changed
  else if(country.currentStatus != states[answerStatus].label) {
    statusChanged = answerStatus;
    control.getRange(country.row, 5).setValue(states[statusChanged].label);   
  }
    
  if(statusChanged) {
    var dueDate = country.nextDeadline ? new Date(country.nextDeadline) : false;
          
    if(states[statusChanged].days) {
      // Go from today if no due date is set
      if(!dueDate) {
        dueDate = new Date();
      }
      var newDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() + states[statusChanged].days);
    
      // Status has changed, due date has not. Update due date.
      if(dueDate == answerDue) {
        setValue(answerControlSheet, "Status Due", newDueDate.toDateString());
        control.getRange(country.row, 10).setValue(newDueDate.toDateString());        
      }
    }
    else {
      setValue(answerControlSheet, "Status Due", '');
      control.getRange(country.row, 10).setValue('');
    }
    
    emailStateChange(country, statusChanged);
  }
  
  // Fill in a deadline on the answer sheet if not found and one appears in the Master Control sheet
  if(country.nextDeadline && !answerDue) {
    setValue(answerControlSheet, "Status Due", '');
  }
  
  // Count answers in answer sheet, per-section and total
  var answerSheet = answers.getSheetByName("Answers"),
      answerGrid = loadTableData(answerSheet),
      master = loadSurveyMaster(),
      firstColumn = 21,
      answers = {}; // Per-section answer counts
  
  for(var i = 0, answerRow; i < answerGrid.length, answerRow = answerGrid[i]; i++) {
    if(!answerRow.questionId) {
      continue;
    }
    
    var question = master.questions[answerRow.questionId];
  
    // Skip answers not pertaining to a question
    if(!question) {
      continue;
    }
    
    if(!answers[question.sectionId]) {
      answers[question.sectionId] = 0;
    }
    
    if(answers.response != '-') {
      answers[question.sectionId]++;
      total++;
    }
  }
  
  // Update Master Control sheet to show total number of questions asked
  Logger.log("answers: " + JSON.stringify(answers));
  
  for(var j = 0; j < master.sectionOrder.length; j++) {
    var sectionId = master.sectionOrder[j],
        section = master.sections[sectionId],
        total = section.questions.length;
  
    control.getRange(country.row, firstColumn + j).setValue(answers[sectionId] ? answers[sectionId] : 0);

    if(answers[sectionId] == total) {
      control.getRange(country.row, firstColumn + j).setBackground("Green");
    }
    else {
      control.getRange(country.row, firstColumn + j).setBackground("Red");
    }    
  }
  
  ass.toast("Done", country.name);
}

/**
 * Set a value in a configuration sheet
 */
function setValue(sheet, setting, value) {
  var grid = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();
  
  for(var i = 0; i < grid.length; i++) {
    if(grid[i][0] == setting) {
      sheet.getRange(i + 1, 2).setValue(value);
    }
  }
}

/** 
 * Get a value from the configuration sheet
 */ 
function getConfig(variable) {
  if(!getConfig.config) {
    getConfig.config = {};
  }
  
  if(typeof getConfig.config[variable] !== 'undefined') {
    return getConfig.config[variable];
  }
  
  var configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config'),
      config = loadKVData(configSheet);
  
  for(var i in config) {
    config[i] = config[i][0];
  }
  
  getConfig.config = config;
  
  return getConfig.config[variable];
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

function archiveSheet(id, stage) {
    var folderID = getConfig("archive_folder");
    var sheet = DocsList.getFileById(id);
    var folder = DocsList.getFolderById(folderID);
    var copy = sheet.makeCopy("ARCHIVE ONLY: " + sheet.getName() + " - Stage " + stage + " - " + getDeadline());
    copy.addToFolder(folder);
}


/*
 * Mail messages. Accept various substitutions in the form of %sub% in the 
 * subject or body of the email. 
 */
function mailAlert(state, subs) {
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      emailSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Emails'),
      emails = loadTableData(emailSheet, 'status'),
      email = emails[state];
  
  if(!email) {
    return;
  }
  
  // Replace substitution vars
  ['recipients', 'subject', 'body'].map(function(s) {
    var body = email[s];
    
    for(var sub in subs) {
      body = body.replace(new RegExp('%' + sub + '%', "g"), subs[sub]);
    }
    
    email[s] = body;
  });
   
  ass.toast("Sending email to " + email.recipients, subs.country, -1);
  
  email = {
    to: email.recipients,
    cc: subs.coordinatorEmail,
    subject: email.subject,
    name: "The Web Index Survey",
    replyTo: subs.coordinatorEmail,
    body: email.body,
    // Turn comma-separated attachment config vars, which are just file IDs, into PDFs
    attachments: email.attachments.split(',').map(function(attachment_var) {
      try {
        return DocsList.getFileById(getConfig(attachment_var)).getAs(MimeType.PDF);
      }
      catch(e) {
        Logger.log("There was an error getting the attachment `" + attachment_var + "` (" + getConfig(attachment_var) + ")");
      }

      return false;
    }).filter(function(v) { return !!v; })
  }
  
  Logger.log("sending email: " + JSON.stringify(email));
  
  MailApp.sendEmail(email);
   
  ass.toast("Done " + email.recipients, subs.country);
}

function emailStateChange(country, state) {
  var ass = SpreadsheetApp.getActiveSpreadsheet(),
      control = ass.getSheetByName('Control'),
      states = loadStates(),
      status = states[state];
  
  var subs = {};
  
  // Perform shallow-copy of country variables,
  for(var i in country) {
    subs[i] = country[i];
  }
  
  // And then some additional subs
  subs.surveyUrl = getConfig('survey_url') + subs.answerSheet;
  subs.handbookUrl = getConfig('handbook'); // TODO: How do I best get a link out of this?
  subs.country = subs.name;
  subs.researcherGoogle = subs.researcherEmail.split(/,/)[0];
  subs.reviewerGoogle = subs.reviewerEmail.split(/,/)[0];
  subs.deadline = subs.nextDeadline;
  
  // And all configuation sheet values
  var config = loadKVData(ass.getSheetByName("Config"));
  
  for(var i in config) {
    subs[i] = config[i];
  }
  

  // Turn the following config properties into URLs. 
  // Keys are config variables, values are substitution variables
  var configUrlMap = {
    'quickstart_guide': 'quickstartUrl',
    'responding_guide': 'respondingUrl',
    'reviewers_guide': 'reviewers',
  }
  
  // Researcher Email
  if(subs.researcherEmail == '') {
    Logger.log("No researcher address found for the researcher yet. Please assign a researcher first.");
    
    control.getRange(country.row, 5).setValue(states.recruitment.label);
    return;
  }
  
  // Get email of current user for saving notes
  var userEmail = Session.getUser().getEmail();
  
  var notes = control.getRange(country.row, 5).getNote().split("\n---\n").map(function(note) {
    var matches = note.match(/^(.+): (\w+) \| (.+): ([\s\S]+)$/);
    
    return matches ? {
      date: matches[1],
      status: matches[2],
      party: matches[3],
      message: matches[4]
    } : false;
  }).filter(function(val) {
    return !!val;
  });
  
  // Log activities in notes on 'Status' field. Use history to direct logic
  function addNote(message) {    
    var date = new Date();

    ass.toast("Adding note: " + message, country.name);
    
    notes.unshift({
      status: state,
      date: date.toDateString() + ' ' + date.toLocaleTimeString(),
      party: userEmail,
      message: message
    });
    
    control.getRange(country.row, 5).setNote(notes.map(function(note) {
      return note.date + ': ' + note.status + ' | ' + note.party + ': ' + note.message;      
    }).join("\n---\n"));
  }

  switch(state) {
    case 'recruitment':
      addNote("Placed into recruitment mode");
      
      break;
      
    // Research
    case 'assigned':      
      country.deadline = getDeadline(status.days, true);
      
      // Notify
      mailAlert('assigned', subs);
      
      ass.toast("Shared sheet with Researcher " + country.researcherName, country.name);
      
      //Set deadline value
      control.getRange(row, 10).setValue(getDeadline(status.days));
      
      //Log
      addNote("Assigned to " + country.researcherName + " <" + country.researcherEmail + "> with deadline " + country.deadline);
      
      break;
      
    // Spot check
    case 'spotcheck':
      archiveSheet(country.answerSheet, status);
      
      // Log
      addNote("Spot check by " + country.coordinatorName);
      
      // Mail
      mailAlert('spotcheck', subs);
      
      break;
      
    // Clarifications requested
    case 'clarification':         
      country.deadline = getDeadline(status.days, true);
      
      control.getRange(country.row, 10).setValue(getDeadline(status.days));
      
      // Add note to history
      addNote("Requested clarifications from " + country.researcherName);
      
      // We may have already done a round of clarification. If so, set clarification_again email
      // instead
      var clarifications = notes.filter(function(note) {
        return note.status == 'clarification';
      });
      
      if(clarifications.length > 1) {
        mailAlert('clarification_again', subs);
      }
      else {
        mailAlert('clarification', subs);
      }
      
      // Alert
      ass.toast("A mail has been sent to the researcher. Follow up with additional detail if required", "Requesting clarification");
      break;
      
    // Review
    case 'review':
      if(!country.reviewerName || !country.reviewerEmail) {
        Browser.msgBox("No Reviewer email provided for " + vals.country, "Error");
        return;
      }
      
      // Set next deadline
      control.getRange(country.row,10).setValue(getDeadline(status.days));

      // Add note to history
      addNote("Sent for review to " + country.reviewerName);
      
      // We may have already done a round of review. If so, set review_again email
      // instead
      var reviews = notes.filter(function(note) {
        return note.status == 'review';
      });
      
      if(reviews.length > 1) {
        mailAlert('review_again', subs);
      }
      else {
        mailAlert('review', subs);
      }

      archiveSheet(country.answerSheet, 'Review' + (reviews.length ? ' #' + reviews.length : ''));
          
      //Alert
      ass.toast("Moved survey to Review mode to be reviewed by " + country.reviewerName, country.name);
      
      break;
      
    // Validation
    case 'validation':
      // Log
      addNote("Post-review validation by " + country.coordinatorName);
      
      // Mail
      mailAlert('validation', subs);
      
      break;
     
    case 'complete':
      // Log
      addNote("Set as complete by " + country.coordinatorName);
      
      //Send mail
      mailAlert('researcher_complete', subs);
      mailAlert('reviewer_complete', subs);
      
      //Clear deadline
      control.getRange(country.row, 10).setValue("Completed");
      
      //Alert
      ass.toast("Mail sent to researcher and reviewer.","Completed " + country.name);
      
      break;
      
    default:
      ass.toast("Unknown status - " + state, country.name);  
      break;
  }
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

