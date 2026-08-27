import { SceneObject } from '../objects/object.js';
function finite(value,name){value=Number(value);if(!Number.isFinite(value))throw new Error(`${name} must be finite`);return value;}function positive(value,name){value=finite(value,name);if(value<=0)throw new Error(`${name} must be positive`);return value;}
class ImageReferenceLayer extends SceneObject{
  constructor({id='image-reference-layer',image=null,opacity=.5,transform={},y=.002,visible=true,metadata={}}={}){super({id,selectable:false,visible,metadata});this.image=null;this.opacity=Math.max(0,Math.min(1,Number(opacity)));this.referencePosition=[finite(transform.position?.[0]??0,'Reference x'),finite(transform.position?.[1]??0,'Reference z')];this.rotation=finite(transform.rotation??0,'Reference rotation');this.scaleValue=[positive(transform.scale?.[0]??1,'Reference scale x'),positive(transform.scale?.[1]??1,'Reference scale z')];this.y=finite(y,'Reference y');if(image!=null)this.setImage(image);}
  get position2D(){return this.referencePosition;}
  setImage(image){this.image=image;this.emit('imageChanged',{image});return this;}
  setOpacity(value){this.opacity=Math.max(0,Math.min(1,finite(value,'Reference opacity')));this.emit('transformChanged');return this;}
  setTransform({position=this.referencePosition,rotation=this.rotation,scale=this.scaleValue}={}){this.referencePosition=[finite(position[0],'Reference x'),finite(position[1],'Reference z')];this.rotation=finite(rotation,'Reference rotation');this.scaleValue=[positive(scale[0],'Reference scale x'),positive(scale[1],'Reference scale z')];this.emit('transformChanged');return this;}
  translate(dx,dz){this.referencePosition[0]+=finite(dx,'Reference dx');this.referencePosition[1]+=finite(dz,'Reference dz');this.emit('transformChanged');return this;}
  rotate(delta){this.rotation+=finite(delta,'Reference rotation delta');this.emit('transformChanged');return this;}
  scale(sx,sz=sx){this.scaleValue[0]*=positive(sx,'Reference scale x');this.scaleValue[1]*=positive(sz,'Reference scale z');this.emit('transformChanged');return this;}
  show(){this.visible=true;this.emit('visibilityChanged',{visible:true});return this;}
  hide(){this.visible=false;this.emit('visibilityChanged',{visible:false});return this;}
  imageToLocal([x,z]){x=finite(x,'Image x')*this.scaleValue[0];z=finite(z,'Image z')*this.scaleValue[1];const c=Math.cos(this.rotation),s=Math.sin(this.rotation);return[this.referencePosition[0]+x*c-z*s,this.referencePosition[1]+x*s+z*c];}
  localToImage([x,z]){x=finite(x,'Local x')-this.referencePosition[0];z=finite(z,'Local z')-this.referencePosition[1];const c=Math.cos(-this.rotation),s=Math.sin(-this.rotation);return[(x*c-z*s)/this.scaleValue[0],(x*s+z*c)/this.scaleValue[1]];}
  draw(renderer,context={}){if(!this.image||this.visible===false)return;renderer?.imagePlane?.(this.image,{position:this.referencePosition,rotation:this.rotation,scale:this.scaleValue,y:this.y,opacity:this.opacity},this,context);}
  destroy(){this.listeners.clear();this.image=null;}
}
export { ImageReferenceLayer };
