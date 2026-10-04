// Quoted CSV alone does not prevent spreadsheet formulas from executing.
export function csvCell(value){
 const text=String(value??'').replace(/^(?=[\s]*[=+@-]|[\t\r\n])/ ,"'");
 return '"'+text.replaceAll('"','""')+'"';
}
