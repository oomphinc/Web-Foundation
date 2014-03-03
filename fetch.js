function onOpen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var menuEntries = [ {name: "Update progress", functionName: "fetchData"} ];
  ss.addMenu("ODB", menuEntries);
}

function fetchData() {
  var dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Control");
  
 for(var i = 1; i < dataSheet.getMaxRows(); i++) {
    sheet = dataSheet.getRange(i+1,13).getValue();
    if(sheet) { 
      var sheetObj = SpreadsheetApp.openById(sheet);
      dashboard = sheetObj.getSheetByName("Dashboard");
      var out = "";
      for(var d = 0; d < 18; d++) {
           dataSheet.getRange(i+1,(20+d)).setValue(dashboard.getRange("E"+(d+9)).getValue());
      }
    }

  } 
}


function fetchFullData() {
  var controlSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Control");
  var masterDataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
  
  
  for(var i = 1; i < controlSheet.getMaxRows(); i++) {
  // for(var i = 1; i < 4; i++) {
    sheet = controlSheet.getRange(i+1,13).getValue();
    if(sheet) { 
      var sheetObj = SpreadsheetApp.openById(sheet);
      dataSheet = sheetObj.getSheetByName("Data");
           
      data = dataSheet.getRange("A2:AS33").getValues();
      masterDataSheet.getRange("A" + (i*33) + ":AS" + (i*33 + 31)).setValues(data);
      
    }

  } 
}


function fixFullData() {
  var controlSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Control");
  var masterDataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MasterData");
  
  
  for(var i = 1; i < controlSheet.getMaxRows(); i++) {
  // for(var i = 1; i < 4; i++) {
    sheet = controlSheet.getRange(i+1,13).getValue();
    if(sheet) { 
      var sheetObj = SpreadsheetApp.openById(sheet);
      dataSheet = sheetObj.getSheetByName("Data");
      dataSheet.getRange("A18").setValue("ODB.2013.I.ENTR");
    }

  } 
}


