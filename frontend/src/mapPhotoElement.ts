import type {mapPhotoIdentity} from './personalMap';

/** Reuse decoded pixels; a changed identity must still clear or replace them. */
export function updateMapPhotoElement(button:HTMLElement,identity:ReturnType<typeof mapPhotoIdentity>,source:string){
  const photo=identity.photo;
  button.style.display=photo?'':'none';
  if(photo){
    let image=button.querySelector('img');
    if(!image||image.getAttribute('src')!==source){
      image=button.ownerDocument.createElement('img');image.loading='lazy';image.decoding='async';image.src=source;
      button.replaceChildren(image);
    }
    image.alt=identity.name;
    image.classList.toggle('is-whole-photo',!!photo.contain);
    image.classList.toggle('is-baked-avatar',!!photo.bakedAvatar);
  }else if(button.childElementCount){button.replaceChildren();}
  button.dataset.portrait=photo?'verified':'unavailable';
  button.dataset.photoSource=identity.source;
  button.dataset.photoEvent=identity.eventId??'';
  button.title=photo?photo.context:'';
}
