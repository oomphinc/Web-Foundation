/*
 * We make use of version 21 of the DocListExtended class from https://sites.google.com/site/scriptsexamples/new-connectors-to-google-services/driveservice
 * This has addCommenter and removeCommenter support
 *
 * STATUS LISt
 *
 */

//Which columns are key values to be found in...
var COL_COORDINATOR = 8;
var COL_RESEARCHER = 10;
var COL_REVIEWER = 12;
var COL_SHEETID = 13;
var DOMAIN = 'opendatabarometer.org';
var CONTROLSHEET = '0ApqzJROt-jZ0dGxEZ1M0X2p2UW04amV6Zmw4VFFRQ3c';

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
function getDate(days_to_add, text) {
  days_to_add = days_to_add || 0;
  var currentTime = new Date()
  var newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + days_to_add);
  var month = newTime.getMonth() + 1
  var day = newTime.getDate()
  var year = newTime.getFullYear()
  if(text) {
    suffix = ["st","nd","rd","th","th","th","th","th","th","th","th","th","th","th","th","th","th","th","th","th","st","nd","rd","th","th","th","th","th","th","th","st"]
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
         configSheet.getRange(i+1,4).setValue(getDate());
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

function archiveSheet(id,stage) {
    folderID = getConfig("archive_folder");
    var sheet = DocsList.getFileById(id);
    var folder = DocsList.getFolderById(folderID);
    var copy = sheet.makeCopy("ARCHIVE ONLY: " + sheet.getName() + " - Stage " + stage + " - " + getDate());
    copy.addToFolder(folder);
}

/** 
 * Copy the sheet specified in master_sheet to a new location, named after the country code and country.
 */ 
function copySheet(countryCode, country) {
  masterSheetID = getConfig("master_sheet");
  folderID = getConfig("folder");

  var masterSheet = DocsList.getFileById(masterSheetID);
  var folder = DocsList.getFolderById(folderID);
  var copy = masterSheet.makeCopy(countryCode + " - " + country + " - Open Data Barometer");
  copy.addToFolder(folder);
  
  var newSheet = SpreadsheetApp.open(copy);
  
  newSheet.getSheetByName("Dashboard").getRange("D3").setValue(country);  
  Logger.log("Created" + countryCode + " - " + country + " - Open Data Barometer");  
  return copy.getId(); 
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
 * Move into spot-check mode
 *
 */
function spotCheck(sheetID,coordinator,countrycode) { 

  var file = DocsList.getFileById(sheetID);
  
  //Remove all editors apart from coordinator and current user
  var removed = new Array();
  var editors = file.getEditors();
  Logger.log('Editors: ' + editors.join(', '));
  editors.forEach(function(editor) { // editor = editors[i]
    if (editor.getEmail() != Session.getActiveUser().getEmail() && editor.getEmail() != coordinator && editor.getEmail() && editor.getEmail() != 'team@opendatabarometer.org' && editor.getEmail() != 'admin@opendatabarometer.org'  && editor.getEmail() != 'hania@webfoundation.org' && editor.getEmail() != 'josema@webfoundation.org'  && editor.getEmail() != 'jules@webfoundation.org'  && editor.getEmail() != 'karin@webfoundation.org') {
    //  file.removeEditor(editor.getEmail().toLowerCase());
    //  removed.push(editor.getEmail().toLowerCase());
    }
  });
  SpreadsheetApp.getActiveSpreadsheet().toast("Removed access to " + country + " from " + removed.join(', '),"Into spotcheck mode");
  
  
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
 * Ask user for how long should be given for updates
 */
function set_time_limit(default_time) {
 /** var time_limit = Number(Browser.inputBox('Deadline control','How many (calendar) days should this task be given? Enter numbers only (defaut ' + default_time +')',Browser.Buttons.OK));

  if(Math.floor(time_limit) == time_limit) {
    return time_limit;
  } else {
    Browser.msgBox("Invalid limit given - setting default of " + default_time + " days. Please ammend manually and notify researcher/reviewer if required.");
    return default_time;
  }
  */
  return default_time;
}

/**
 *
 * Handle changes to the status column to move the sheet through the different processes
 *
 */
function onUpdate(event) {
  //Check we are changing the status column, and we have a single value from a single cell change
  if(event.range.getColumn() == 5 && event.source.getSheetName() == "Control" && event.value) {
    if(event.value) {
      status = event.value.split(".").shift();
      sheetid = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_SHEETID).getValue();
      countrycode = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),1).getValue();
      country = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),2).getValue();
      
      researcher = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_RESEARCHER).getValue();
      researcherName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_RESEARCHER-1).getValue();
      
      reviewer = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_REVIEWER).getValue();
      reviewerName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_REVIEWER-1).getValue();
      
      coordinator = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_COORDINATOR).getValue();
      coordinatorName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_COORDINATOR -1).getValue();
      
      switch(status) {
        case "0":
          noteLog(event.range.getRow(),"Placed into recruitment mode");
          
        break;
        //Research
        case "1":
          if(sheetid == "") {
            newSheetID = copySheet(countrycode,country);
            SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_SHEETID).setValue(newSheetID);
            
            //Log
            noteLog(event.range.getRow(),"Created sheet " + newSheetID);
            
            SpreadsheetApp.getActiveSpreadsheet().toast("Created new sheet for " + country,"Creating sheet");
            sheetid = newSheetID;
          }
          
          if(!(researcher == "")) {
           time_limit = set_time_limit(7);
            
           shareWithResearcher(sheetid,researcher); 
           
           //Set deadline value
           SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),6).setValue(getDate(time_limit));
           
           //Log
           noteLog(event.range.getRow(),"Assigned to " + researcher + " with deadline " + getDate(7));
           
           //Send mail 
           mailAlert(researcher,researcherName,"assigned",country,sheetid,coordinator,coordinatorName,getDate(time_limit,true));
           
           //Alert 
           SpreadsheetApp.getActiveSpreadsheet().toast("Shared sheet for " + country + " with researcher " + researcher,"Sharing sheet");
            
          } else {
           Browser.msgBox("No researcher e-mail address for " + country); 
          }
        break;
        
          
          
        //Spot check
        case "2":   
          spotCheck(sheetid,coordinator,countrycode);
          
          archiveSheet(sheetid,2);
         
          //Log
          noteLog(event.range.getRow(),"Spot check by " + coordinator);
          
          //Mail
          mailAlert(coordinator,coordinatorName,"spotcheck",country,sheetid,coordinator,coordinatorName,"");          
          
        break;
        
        //Clarifications requested
        case "3":   
          time_limit = set_time_limit(3);
          
          shareWithResearcher(sheetid,researcher); 
          
          //Set deadline value
          SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),6).setValue(getDate(time_limit));
          
          //Send mail 
          mailAlert(researcher,researcherName,"clarification",country,sheetid,coordinator,coordinatorName,getDate(time_limit,true));
          
          //Log
          noteLog(event.range.getRow(),"Requested clarifications from " + researcher);
          
          //Alert
          SpreadsheetApp.getActiveSpreadsheet().toast("A mail has been sent to the researcher. You are cc in. Follow up with additional detail if required","Requesting clarification");
        break;
          
        //Review
        case "4":
          time_limit = set_time_limit(5);
          
          if(sheetid == "") {
            Browser.msgBox("No sheet available");
          } else {
            //Run the spot-check mode just in case we are leapfrogging; to ensure no-one gets access who shouldn't.
            
            
            spotCheck(sheetid,coordinator,countrycode);
            
            archiveSheet(sheetid,3);
            
            //Add the reviewer
            if(reviewer) {

              
              //Share with reviewer
              shareWithReviewer(sheetid,reviewer,countrycode);
              
              //Set deadline value
              SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),6).setValue(getDate(time_limit));
              
              //Log
              noteLog(event.range.getRow(),"Sent for review to " + reviewer);
          
              //Send mail 
              mailAlert(reviewer,reviewerName,"review",country,sheetid,coordinator,coordinatorName,getDate(time_limit,true));
              
              //Alert
              SpreadsheetApp.getActiveSpreadsheet().toast("Granted access for " + reviewer,"Into review mode");
              
            } else {
              Browser.msgBox("No reviewer e-mail provided for " + country);
            }
          }
          
        break;
          
        //Spot check
        case "5":   
          spotCheck(sheetid,coordinator,countrycode);
          
          //Log
          noteLog(event.range.getRow(),"Post review spot check by " + coordinator);
          
          //Mail
          mailAlert(coordinator,coordinatorName,"spotcheck",country,sheetid,coordinator,coordinatorName,"");          
          
        break;  
        
          
        case "6":
          time_limit = set_time_limit(5);
          
          if(sheetid == "") {
            Browser.msgBox("No sheet available");
          } else {
            researcher = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),COL_RESEARCHER).getValue();
            if(!(researcher == "")) {
              
              
              archiveSheet(sheetid,6);
              
              shareWithResearcher(sheetid,researcher); 
              
              //Set deadline value
              SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),6).setValue(getDate(time_limit));
              
              //Log
              noteLog(event.range.getRow(),"Returned for further research to " + researcher);
              
              //Send mail 
              mailAlert(researcher,researcherName,"secondary_research",country,sheetid,coordinator,coordinatorName,getDate(time_limit,true));
              
              //Alert
              SpreadsheetApp.getActiveSpreadsheet().toast("A mail has been sent to the researcher. You are cc in. Follow up with additional detail if required","Secondary research");

              
            } else {
             Browser.msgBox("No researcher e-mail address for " + country); 
            }
          }
        break;
         
          
        case "7":
          spotCheck(sheetid,coordinator,countrycode);
          
          //Log
          noteLog(event.range.getRow(),"Post review spot check by " + coordinator);
          
          //Mail
          mailAlert(coordinator,coordinatorName,"spotcheck",country,sheetid,coordinator,coordinatorName,""); 
        break;
          
        case "8":
          time_limit = set_time_limit(5);
          
          if(sheetid == "") {
            Browser.msgBox("No sheet available");
          } else {
            //Run the spot-check mode just in case we are leapfrogging; to ensure no-one gets access who shouldn't.
            
            spotCheck(sheetid,coordinator,countrycode);
            
            //Add the reviewer
            if(reviewer) {
              
              
              //Share with reviewer
              shareWithReviewer(sheetid,reviewer,countrycode);
              
              //Set deadline value
              SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),6).setValue(getDate(time_limit));
              
              //Log
              noteLog(event.range.getRow(),"Sent for secondary review to " + reviewer);
          
              //Send mail 
              mailAlert(reviewer,reviewerName,"secondary_review",country,sheetid,coordinator,coordinatorName,getDate(time_limit,true));
              
              //Alert
              SpreadsheetApp.getActiveSpreadsheet().toast("Granted access for " + reviewer,"Into review mode");
              
            } else {
              Browser.msgBox("No reviewer e-mail provided for " + country);
            }
          }
          
        break;  
          
        case "9":
          archiveSheet(sheetid,9);
          
          spotCheck(sheetid,coordinator,countrycode);
          
          //Log
          noteLog(event.range.getRow(),"Final validation to be carried out by " + coordinator);
          
        break;
          
        case "10":
          
            spotCheck(sheetid,coordinator,countrycode);
            
            //Log
            noteLog(event.range.getRow(),"Set as complete by " + coordinator);
            
            //Send mail
            mailAlert(researcher,researcherName,"complete_research",country,sheetid,coordinator,coordinatorName,"");
            mailAlert(reviewer,reviewerName,"complete_review",country,sheetid,coordinator,coordinatorName,"");
            
            //Clear deadline
            SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(event.range.getRow(),6).setValue("Completed");
            
            //Alert
            SpreadsheetApp.getActiveSpreadsheet().toast("Mail sent to researcher and reviewer.","Completed");
         
        break;
        default:
           SpreadsheetApp.getActiveSpreadsheet().toast("Unknown status - " + event.value, "Updating status");  
        break;
      }
        
    }
  }
}

/*
 * Log activities in note
 *
 */ 
function noteLog(row, message) {
    cell = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange(row,5);
    note = cell.getNote();
    note = getDate() + " " + Session.getUser().getEmail() + ": " + message + "\n---\n" + note;
    cell.setNote(note);
}

/*
 * Mail messages
 */
function mailAlert(email,name,status,country,sheetID,coordinator,coordinatorName,deadline) {
  account = getAccount(email);
  
  switch(status) {
    case "assigned":   
      message = "Dear " + name + "\n\nThank you for agreeing to carry out research for the Open Data Barometer for " + country + ".\n\n";
      message = message + "The research form for " + country + " is located at https://docs.google.com/spreadsheet/ccc?key=" + sheetID + "\n\n";
      message = message + "Username: " + account.username + "\n";
      message = message + "Password: " + account.password + "\n\n";
      message = message + "This log-in system is provided by Google Docs. If you are already logged into a Google account, you may need to log-out and log-in acount with the account details above, or use the 'Choose a different account' link. For further details see the Getting Started guide attached.\n\n";
      message = message + "Please complete your initial research by " + deadline + ". If you are unable to meet this deadline, please consult with your regional coordinator ("+coordinator+"). As soon as you have finished your research you should mail your regional coordinator to request review of your answers.\n\n";
      message = message + "You must enter your research results into this *online* version of the survey form. DO NOT download the form, and DO NOT alter the structure in any way. ";
      message = message + "The Research Handbook is also shared with you, and is attached to this e-mail. You can access the handbook with the account details above at: https://docs.google.com/a/opendatabarometer.org/document/d/15Jf76gZl2RNQ3HYth0vgzfGucH1rNDpPth7KxzTtUiE/edit \n\n";
      message = message + "You can also find a series of training videos at http://bit.ly/1ee2KxX which introduce the Barometer focus, the survey form, and offer research tips. ";
      message = message + "If you have any questions at any point please contact your research coordinator: " + coordinatorName + " ("+coordinator+")";
      message = message + "\n\n Yours sincerely \n\n Tim Davies, ODB Coordinator";
 
      attachment = DocsList.getFileById(getConfig('handbook'));
      attachment2 = DocsList.getFileById(getConfig('quickstart_guide'));     
      MailApp.sendEmail(email,"You have been assigned " + country + " to research - Open Data Barometer",message, {attachments: [attachment.getAs(MimeType.PDF),attachment2.getAs(MimeType.PDF)], cc: coordinator,name:"Open Data Barometer"});
      
    break;
    
    case "spotcheck":
      message = "Dear " + coordinatorName + "\n\n"
      message = message + "The country sheet for " + country + " is ready for a spot-check. \n\n"
      message = message + "https://docs.google.com/spreadsheet/ccc?key=" + sheetID + "\n\n";
      message = message + "Please ensure that the current round of research/review has been correctly completed, and then either return to the researcher/review, or forward this to the next stage of the process.\n\n";
      message = message + "Control sheet https://docs.google.com/spreadsheet/ccc?key=" +CONTROLSHEET + " \n\n";
      message = message + "Thanks again!\n\nThe ODB-Bot";
      
      MailApp.sendEmail(coordinator, "ODB: " + country + " ready for spot check",message, {name:"ODB-Bot"});
    break;
      
      
    case "clarification":   
      message = "Dear " + name + "\n\nRe: Open Data Barometer research for " + country + ".\n\n";
      message = message + "We have reviewed your research and request some clarifications before it goes forward to the next stage. Use the links below* to access the form and review comments you have been left.\n\n";
      message = message + "Research form: https://docs.google.com/spreadsheet/ccc?key=" + sheetID + "\n";
      message = message + "Username: " + account.username + "\n";
      message = message + "Password: " + account.password + "\n\n";
      message = message + "Please respond to these comments by " + deadline + ". If you are unable to meet this deadline, please notify your regional coordinator. As soon as you have responding to all the outstanding comments please notify your regional coordinator.\n\n";
      message = message + "A guide to responding to comments is attached. Remember - you must enter your research results into this *online* version of the survey form.\n\n";
      message = message + "If you have any questions about this process, please contact your research coordinator: " + coordinatorName + " ("+coordinator+")";
      message = message + "\n\n Yours sincerely \n\n Tim Davies, ODB Coordinator";
      message = message + "\n\n\*The log-in system is provided by Google Docs. If you are already logged into a Google account, you may need to log-out and log-in acount with the account details above, or use the 'Choose a different account' link. For further details see the Getting Started guide that came with your original notification.\n\n";
      
      attachment = DocsList.getFileById(getConfig('responding_guide'));
      MailApp.sendEmail(email,"Clarifications are needed for your " + country + " Open Data Barometer research",message, {attachments: [attachment.getAs(MimeType.PDF)], cc: coordinator,name:"Open Data Barometer"});
      
     break;
  
     case "review":   
      message = "Dear " + name;
      message = message + "\n\nThankyou for agreeing to be a reviewer for the Open Data Barometer. The research for " + country + " is now ready for you to review.\n\n";
      message = message + "You can access it at: https://docs.google.com/spreadsheet/ccc?key=" + sheetID + "\n";
      message = message + "Username: " + account.username + "\n";
      message = message + "Password: " + account.password + "\n\n";
      message = message + "This log-in system is provided by Google Docs. If you are already logged into a Google account, you may need to log-out and log-in acount with the account details above, or use the 'Choose a different account' link. For further details see the Getting Started guide attached. A guide to carrying out the review process is also attached.\n\n";
      message = message + "Please complete your review by " + deadline + ". If you are unable to meet this deadline, please consult with your regional coordinator. As soon as you have finished your review you should mail your regional coordinator.\n\n";
      message = message + "You must carry out your review using the *online* version of the survey form, and only by using the Google Docs comments feature to leave comments for the researcher. DO NOT edit any section of the form other than to indicate when your review is complete and DO NOT alter the structure in any way.";
      message = message + "The Research Handbook is also shared with you, and is attached to this e-mail. You should consult this before and during carrying out your review. \n\n";
      message = message + "You can also find a series of training videos at http://bit.ly/1ee2KxX which introduce the Barometer focus, the survey form, and include tips given to researchers.";
      message = message + "If you have any questions about this process, please contact your research coordinator: " + coordinatorName + " ("+coordinator+")";
      message = message + "\n\n Yours sincerely \n\n Tim Davies, ODB Coordinator";
      
      attachment = DocsList.getFileById(getConfig('reviewers_guide'));
      attachment2 = DocsList.getFileById(getConfig('quickstart_guide')); 
      MailApp.sendEmail(email,"You been assigned " + country + " to review for the Open Data Barometer",message, {attachments: [attachment.getAs(MimeType.PDF),attachment2.getAs(MimeType.PDF)], cc: coordinator,name:"Open Data Barometer"});
     break;

    case "secondary_research":   
      message = "Dear " + name + "\n\nRe: Open Data Barometer research for " + country + ".\n\n";
      message = message + "A expert reviewer has now looked in detail at your Open Data Barometer research for " + country + " and they have left comments for you to address.\n\n";
      message = message + "Please return to the research form and respond to these comments by " + deadline + ". If you are unable to meet this deadline, please notify your regional coordinator. As soon as you have responding to all the outstanding comments please notify your regional coordinator.\n\n";
      message = message + "Research form: https://docs.google.com/spreadsheet/ccc?key=" + sheetID + "\n";
      message = message + "Username: " + account.username + "\n";
      message = message + "Password: " + account.password + "\n\n";
      message = message + "A guide to responding to comments is attached.\n\n";
      message = message + "If you have any questions about this process, please contact your research coordinator: " + coordinatorName + " ("+coordinator+")";
      message = message + "\n\n Yours sincerely \n\n Tim Davies, Research Coordinator";
      message = message + "\n\n\*The log-in system is provided by Google Docs. If you are already logged into a Google account, you may need to log-out and log-in acount with the account details above, or use the 'Choose a different account' link. For further details see the Getting Started guide that came with your original notification.\n\n";
      
      attachment = DocsList.getFileById(getConfig('responding_guide'));
      MailApp.sendEmail(email,"Your Open Data Barometer research for " + country + " has been reviewed. Action required.",message, {attachments: [attachment.getAs(MimeType.PDF)], cc: coordinator,name:"Open Data Barometer"});
      
     break;
  
     case "secondary_review":   
      message = "Dear " + name;
      message = message + "The research for " + country + " has been updated and is ready for further review.\n\n";
      message = message + "You can access it at*: https://docs.google.com/spreadsheet/ccc?key=" + sheetID + "\n";
      message = message + "Username: " + account.username + "\n";
      message = message + "Password: " + account.password + "\n\n";
      message = message + "Please log-in and check that all your comments have been adequately addressed and that you agree with any revised scores, sources and justifications\n\n";
      message = message + "You can add further comments at this stage if you feel that a further round of review is required.\n\n";
      message = message + "Please complete your review by " + deadline + ". If you are unable to meet this deadline, please consult with your regional coordinator. As soon as you have finished your review you should mail your regional coordinator.\n\n";
      message = message + "You must carry out your review using the *online* version of the survey form, and only by using the Google Docs comments feature to leave comments for the researcher. DO NOT edit any section of the form other than to indicate when your review is complete and DO NOT alter the structure in any way.";
      message = message + "If you have any questions about this process, please contact your research coordinator: " + coordinatorName + " ("+coordinator+")";
      message = message + "\n\n Yours sincerely \n\n Tim Davies, ODB Coordinator";
      message = message + "\n\n\*The log-in system is provided by Google Docs. If you are already logged into a Google account, you may need to log-out and log-in acount with the account details above, or use the 'Choose a different account' link. For further details see the Getting Started guide that came with your original notification.\n\n";

      attachment = DocsList.getFileById(getConfig('reviewers_guide'));
      attachment2 = DocsList.getFileById(getConfig('quickstart_guide')); 
      MailApp.sendEmail(email,"Further review required for " + country + " in the Open Data Barometer",message, {attachments: [attachment.getAs(MimeType.PDF),attachment2.getAs(MimeType.PDF)], cc: coordinator,name:"Open Data Barometer"});
     break;

   case "complete_research":   
      message = "Dear " + name + "\n\n";
      message = message + "Your Open Data Barometer research for " + country + " has now been reviewed and has been accepted.\n\n";
      message = message + "It will now go forward to be included in the Open Data Barometer dataset and calculations.\n\n";
      message = message + "We will be in touch soon with an update on progress towards completing the Barometer study.\n\n";
      message = message + "Thank you for your support for this study. If this e-mail indicates completion of the last country you were the lead researcher for then you can now arrange to send in your invoice for this work.\n\n";
      message = message + "Yours sincerely \n\n Tim Davies, ODB Coordinator";

      MailApp.sendEmail(email,"ODB: The research process for " + country + " is now complete",message, {cc: coordinator,name:"Open Data Barometer"});
     break;

   case "complete_review":   
      message = "Dear " + name + "\n\n";
      message = message + "The Open Data Barometer research for " + country + " has now been reviewed and has been accepted.\n\n";
      message = message + "It will now go forward to be included in the Open Data Barometer dataset and calculations.\n\n";
      message = message + "We will be in touch soon with an update on progress towards completing the Barometer study.\n\n";
      message = message + "Thank you for your support for this study. A template for invoicing for your work will be sent out to you shortly.\n\n";
      message = message + "Yours sincerely \n\n Tim Davies, ODB Coordinator";

      MailApp.sendEmail(email,"ODB: The research process for " + country + " is now complete",message, {cc: coordinator,name:"Open Data Barometer"});
     break;
  }
  
  
}

function authorise() {
  masterSheetID = getConfig("master_sheet");
  handbook = getConfig("handbook");
  folderID = getConfig("folder");
  var masterSheet = DriveApp.getFileById(masterSheetID);
  var masterSheet = DocsList.getFileById(masterSheetID);
  var handbook = DocsList.getFileById(handbook);
  var folder = DocsList.getFolderById(folderID);
}

function testProcess() {
  Browser.msgBox(getDate(7,true));
}


