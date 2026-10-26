import test from "node:test";
import assert from "node:assert/strict";
import {initializeTheme} from "../src/theme.ts";

test("the light theme is the default while saved light and dark choices are respected",()=>{
  const documentDescriptor=Object.getOwnPropertyDescriptor(globalThis,"document");
  const storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  try{
    for(const [saved,unavailable,expected] of [[null,false,"light"],["unknown",false,"light"],["light",false,"light"],["dark",false,"dark"],[null,true,"light"]] as const){
      const dataset:Record<string,string>={};
      let themeColor="";
      Object.defineProperty(globalThis,"document",{configurable:true,value:{documentElement:{dataset},querySelector:()=>({setAttribute:(_name:string,value:string)=>{themeColor=value;}})}});
      Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>{if(unavailable)throw new Error("Storage unavailable");return saved;}}});
      initializeTheme();
      assert.equal(dataset.theme,expected);
      assert.equal(dataset.seedColorMode,expected==="dark"?"dark-only":"light-only");
      assert.equal(themeColor,expected==="dark"?"#111111":"#ffffff");
    }
  }finally{
    if(documentDescriptor)Object.defineProperty(globalThis,"document",documentDescriptor);else Reflect.deleteProperty(globalThis,"document");
    if(storageDescriptor)Object.defineProperty(globalThis,"localStorage",storageDescriptor);else Reflect.deleteProperty(globalThis,"localStorage");
  }
});
