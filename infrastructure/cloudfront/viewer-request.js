// eslint-disable-next-line @typescript-eslint/no-unused-vars -- CloudFront invokes this global entry point
function handler(event) {
 var request=event.request,uri=request.uri;
 if(uri.indexOf('/api/')===0)return request;
 if(uri==='/development'||uri.indexOf('/development/')===0){
  return {statusCode:302,headers:{location:{value:'/?environment=development'},'cache-control':{value:'no-store'}}};
 }
 if(!/\.[^/]+$/.test(uri)||/\.html$/.test(uri))request.uri='/index.html';
 return request;
}
