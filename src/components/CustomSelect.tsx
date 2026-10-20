import {useMemo,useState,type ReactNode} from "react";
import {Check,ChevronDown} from "lucide-react";
import {Select} from "@seed-design/react";
import "./CustomSelect.css";
export type SelectOption={value:string;label:string;disabled?:boolean;icon?:ReactNode;group?:string};
export function CustomSelect({value,options,onChange,label,disabled=false,placement="bottom-end"}:{value:string;options:SelectOption[];onChange:(value:string)=>void;label:string;disabled?:boolean;placement?:"top-end"|"bottom-end"}){
  const [root,setRoot]=useState<HTMLDivElement|null>(null);
  const [open,setOpen]=useState(false);
  // Native dialogs are in the top layer; their option lists must stay inside them.
  const container=useMemo(()=>({current:root?.closest<HTMLElement>("dialog")??null}),[root]);
  const selected=options.find(option=>option.value===value);
  const groups=[...new Set(options.map(option=>option.group))];
  return <div ref={setRoot} className="custom-select seed-admin-select"><Select.Root value={[value]} onValueChange={values=>{if(values[0]!==undefined)onChange(values[0]);}} open={open} onOpenChange={(next,details)=>{if(details?.reason==="escapeKeyDown")details.event.preventDefault();setOpen(next);}} disabled={disabled} size="responsive" placement={placement} strategy="fixed">
    <Select.Trigger aria-label={`${label}: ${selected?.label??value}`} data-value={value}>
      <span className="select-option-label">{selected?.icon?<span className="admin-select-icon" aria-hidden="true">{selected.icon}</span>:null}<Select.Value>{selected?.label??value}</Select.Value></span><Select.SuffixIcon svg={<ChevronDown aria-hidden="true"/>}/>
    </Select.Trigger>
    {root?<Select.Positioner container={container}><Select.Content className="admin-select-menu" aria-label={label}><Select.ScrollArea>
      {groups.map(group=><Select.Group key={group??"ungrouped"}>{group?<Select.GroupLabel>{group}</Select.GroupLabel>:null}{options.filter(option=>option.group===group).map(option=><Select.Item key={option.value} value={option.value} label={option.label} disabled={option.disabled}>
        {option.icon?<span className="admin-select-icon" aria-hidden="true">{option.icon}</span>:null}<Select.ItemBody><Select.ItemLabel>{option.label}</Select.ItemLabel></Select.ItemBody><Select.ItemIndicator selected={<Check aria-hidden="true"/>}/>
      </Select.Item>)}</Select.Group>)}
    </Select.ScrollArea></Select.Content></Select.Positioner>:null}
  </Select.Root></div>;
}
