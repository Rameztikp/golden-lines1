// Quoted CSV alone does not prevent spreadsheet formulas from executing.
export function csvCell(value){
 const text=String(value??'').replace(/^(?=[\s]*[=+@-]|[\t\r\n])/ ,"'");
 return '"'+text.replaceAll('"','""')+'"';
}

const requestColumns={
 bookings:[['رقم الطلب',r=>r.id],['الحالة',r=>statusLabel(r.status)],['تاريخ الإنشاء',r=>r.created],['اسم العميلة',r=>r.data.name],['رقم الجوال',r=>r.data.phone],['تاريخ الزيارة',r=>r.data.date],['وقت الزيارة',r=>r.data.time],['تاريخ الزفاف',r=>r.data.wedding],['الخدمة',r=>r.data.service],['الفستان',r=>r.data.dress],['ملاحظات العميلة',r=>r.data.notes],['ملاحظات داخلية',r=>r.notes]],
 messages:[['رقم الرسالة',r=>r.id],['الحالة',r=>statusLabel(r.status)],['تاريخ الاستلام',r=>r.created],['الاسم',r=>r.data.name],['البريد الإلكتروني',r=>r.data.email],['الموضوع',r=>r.data.subject],['الرسالة',r=>r.data.message],['ملاحظات داخلية',r=>r.notes]],
 subscribers:[['رقم السجل',r=>r.id],['الحالة',r=>statusLabel(r.status)],['تاريخ الاشتراك',r=>r.created],['البريد الإلكتروني',r=>r.data.email]]
};
const statusLabel=value=>({new:'جديد',confirmed:'مؤكد',completed:'مكتمل',cancelled:'ملغي',read:'مقروء',archived:'مؤرشف'}[value]||value);
export function requestsCsv(kind,rows){const columns=requestColumns[kind];if(!columns)throw new Error('نوع التصدير غير صالح.');const table=[columns.map(([label])=>label),...rows.map(row=>columns.map(([,read])=>read(row)??''))];return '\uFEFFsep=,\r\n'+table.map(line=>line.map(csvCell).join(',')).join('\r\n')}
export function excelCsvBytes(csv){csv=String(csv).replace(/^\uFEFF/,'');const decoder=new TextDecoder('windows-1256'),encoding=new Map();for(let byte=0;byte<256;byte++){const char=decoder.decode(Uint8Array.of(byte));if(char!=='�'&&!encoding.has(char))encoding.set(char,byte)}const output=[];for(const char of csv)output.push(encoding.get(char)??0x3f);return Uint8Array.from(output)}
