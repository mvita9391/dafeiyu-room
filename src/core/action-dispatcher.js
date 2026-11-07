// A key release is an intent, even if the corresponding move is still in flight.
export class ActionDispatcher {
 constructor(execute){this.execute=execute;this.busy=false;this.cancelPending=false;}
 submit(kind,...args){if(this.busy){if(kind==='cancel')this.cancelPending=true;return this.running;}this.busy=true;this.running=(async()=>{try{return await this.execute(kind,...args);}finally{try{if(this.cancelPending){this.cancelPending=false;await this.execute('cancel');}}finally{this.busy=false;}}})();return this.running;}
}
