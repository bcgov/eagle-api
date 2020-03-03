module.exports = [{
	"type" : "doctype",
	"_schemaName" : "List",
	"legislation" : 2018,
	"name" : "Presentation",
  "listOrder" : 2,
  read: ["public", "staff", "sysadmin"],
  write: ["staff", "sysadmin"]
},
{
	"type" : "doctype",
	"_schemaName" : "List",
	"name" : "Meeting Notes",
	"legislation" : 2018,
  "listOrder" : 3,
  read: ["public", "staff", "sysadmin"],
  write: ["staff", "sysadmin"]
},
{
  "type" : "doctype",
	"_schemaName" : "List",
	"legislation" : 2018,
	"name" : "Process Order Materials",
  "listOrder" : 6,
  read: ["public", "staff", "sysadmin"],
  write: ["staff", "sysadmin"]
}];
