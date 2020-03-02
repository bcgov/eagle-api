module.exports = [
  {
    type: "label",
    _schemaName: "List",
    legislation: 2018,
    name: "Certificate Decision",
    listOrder: 20,
    read: ["public", "staff", "sysadmin"],
    write: ["staff", "sysadmin"]
  },
  {
    type: "label",
    _schemaName: "List",
    legislation: 2018,
    name: "Certificate Extension",
    listOrder: 21,
    read: ["public", "staff", "sysadmin"],
    write: ["staff", "sysadmin"]
  },
  {
    type: "label",
    _schemaName: "List",
    legislation: 2018,
    name: "CEAO's Designation",
    listOrder: 2,
    read: ["public", "staff", "sysadmin"],
    write: ["staff", "sysadmin"]
  }
];