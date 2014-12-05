Web Index / Open Data Barometer Survey Tool
==============

This repository contains a custom application built to administer expert surveys, with a defined review process.

It uses a Google Docs back-end to define the surveys and store data, and implements a workflow with three main roles:

* Coordinator
* Primary researcher
* Reviewer

And each survey can be taken through a workflow covering:

* Initial research
* Spot check by coordinator
* Peer review - reviewers can comment but not update information
* Secondary research
* Spot check by coordinator
* Final validation

It incorporates a range of question types, and conditional logic for the display of survey information.

The current implementation was written against the Google Docs platform as of early 2014. Some changes may be required to deploy it against updated platforms.

Development was undertaken by [Oomph Inc](http://www.oomphinc.com/). for the [World Wide Web Foundation](http://www.webfoundation.org) with some of the funding for this work originating in the open data common assessmnet methods component of  [IDRC](http://www.idrc.ca) grant 107075.

## Implementation & deployment

This document summarises the deployment of the Web Index / Open Data Barometer survey tool.

The survey tool consists of four main components:

(1) Front End Application

An Angular.js single page application, supported by a php web-proxy. 

The Angular.js application is found in this repository, and should be deployed to the root of a server.

The php proxy also takes care of storing uploaded files, using a Google Files API instance attached to a defined google account, and then sharing the files with the researcher/reviewer/coordinator as the survey is loaded when moving between states. 

(2) Survey Definitions
These are found in the Templates folder in Web Foundation Web Index Survey 2014 with two sheets: one defining the sections of the survey, and the other defining the questions in each section.

A template Answers sheet is also found in the Templates folder.

(3) Back-end scripts
These are attached to a Control Sheet spreadsheet from which the current state of surveys can be seen and reviewed.

Triggers need to be configured to be run the scripts on updates to the spreadsheet. 

An hourly trigger should be set up to check each answer sheet for changes of state (e.g. research completed) and to update the control sheet. 

(4) Data extract scripts

Used to take data from individual survey responses and aggregate it to a single file. 


## Starting from scratch

### Set up the Survey Questions

(1) Create a new version of the survey questions spreadsheet

This sheet will need to be made globally readable. Often Google Apps for your Organisation file permissions prevent files owned by organisation accounts from being shared to/published to non-logged in users outside the organistion domain. As a result you may need to create this new sheet with a personal Google account.

The 2014 Open Data Barometer Master Question Sheet to copy [is found here](https://docs.google.com/spreadsheet/ccc?key=0ApqzJROt-jZ0dGNoZFFtMnB3dVctNWxyc295dENFWHc&usp=sharing) or an Excel copy is located in the /resources/ folder. 

[ToDo: Upload Excel version of this to repository]

(2) Edit the Survey Questions sheet to reflect the questions you want asked

Sections are defined on the Sections sheet, and questions on the Question sheet. The template should give a sense of how the conditional supplementary questions and other features operate.

Notes:

* At present this will need to be imported/copied to an [old version Google Spreadsheet](https://support.google.com/docs/answer/3544847?hl=en) and should not be updated to the new sheets, as otherwise [certain cross-site issues occur](https://github.com/practicalparticipation/barometer-survey-tool/issues/2).  

(3) Set the sharing settings so that anyone with the link can view

### Set up the server side component

(1) Checkout the code from https://github.com/practicalparticipation/barometer-survey-tool and point a domain / subdomain to this directory

(2) Go to the Google Developer Console at https://console.developers.google.com and

 - Set up a new application
 - Go to APIs & Auth
 - Enable the Drive API under APIs
 - Go to Credentials
 - Create a new ClientID for the Web Application with a valid javascript origin for the site where the service will be hosted
 - Create a new ClientID for a Service Account and generate a p12 key (save this somewhere securely)
 
(2) Edit the js/w3f-survey.js file configuration:

MASTER_KEY - should be the spreadsheet key of the Survey Questions spreadsheet
CLIENT_ID - should be the Client ID given in the Google Developer Console, prepared at step 2
SERVICE_ACCOUNT - should by the E-mail address given in the Google Developer Console, prepared at step 2.

(3) Rename survey-config-sample.php to survey-config.php and edit it to provide:

 - The Service Account Details
 - A path to where you have uploaded the p12 key obtained in step 2.


### Set up the Control Sheet

(1) Make a copy of the Control Sheet template and the Answer Template

Examples of these files are found in the /resources/ folder

If you create a new Control Sheet using these offline templates, then you will need to attach the scripts using the Script Manager. Copies of the control scripts can be found in the GitHub repository under /gdocs-scripts/

(2) Update the Answer Template to reflect the survey being carried out, and the URL of the survey tool

(3) Edit the 'Config' tab of the Control sheet to reflect the location of the Master Question Sheet, the folder where new sheets should be filed, and the Answer Template.

(4) Edit other 'Config' and 'Email' values as required.

(5) Setup triggers
Triggers should be set up as a single user. This user will be the one whose account is used to send out notification mails etc. 
- Go to Tools > Script Editor
- Choose Resources > Current Triggers
- Add two triggers - one for ‘onUpdate’ driven ‘From Spreadsheet’ by ‘On edit’ events, and the other for ‘periodicUpdate’ as a ‘Time-driven’ event on an hourly timer. 


(6) Tweak the scripts

- Update line 31 to reflect the URL of the survey online.

## Using the platform




## Aggregating data





