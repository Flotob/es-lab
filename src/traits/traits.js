// Copyright (C) 2010 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// An ES5 implementation of Traits as defined in:
// "Traits: Composable units of Behavior"
//   (Scharli et. al, ECOOP 2003)
//   http://scg.unibe.ch/archive/papers/Scha03aTraits.pdf

// but closer to the object-based, lexically nestable traits defined in:
// "Adding State and Visibility Control to Traits using Lexical Nesting"
//   (Van Cutsem et. al, ECOOP 2009)
//   http://prog.vub.ac.be/Publications/2009/vub-prog-tr-09-04.pdf

// A trait can be any object. It can define state, but it is advised to
// always expose stateful traits via 'maker' functions, to prevent a stateful
// trait from being composed multiple times with different objects.
// (this is possible, but state is then shared between the two composers,
//  which may result in very bad interactions)

// When a trait is imported, all of its properties are imported into a composite.
// The lexical scope of imported methods remains intact.
// Traits may call back on the composite using 'this', or may be parameterized
// with the composite explicitly to support a more robust alternative to 'this'.
// Required methods are assumed to be found in the composite.
// At composition time, the composer can choose to alias or exclude trait properties.
// Properties inherited from multiple traits result in a 'conflict' property that,
// upon use, raises an exception.

// Interaction between prototype-delegation (inheritance) and traits:
// When importing a trait object, only the trait's own properties are imported.
// Traits are not assumed to have a useful prototype, and should only be composed
// according to recursive trait composition, not according to prototype-inheritance.
// When a non-trait object composes with traits, the trait properties will override
// any properties inherited from the object's prototype. However, the composite object
// still has a prototype and prototype-delegation of composites should still work as expected.

// Objects are composed using two composition operators:
//   compose(compositeTrait, trait, advice)
//   use(compositeObject, trait, advice)

// The difference between both operators is that 'compose' treats name clashes as conflicts,
// whereas 'use' lets composite properties take precedence over trait properties.

// Object props take precedence over trait props.
// Trait props take precedence over the composite's prototype's props.

/**
 * Assuming <tt>obj</tt> is an object written in the normal
 * objects-as-closures style, this convenience method will freeze
 * the object, all the enumerable methods of that object, and all
 * the <tt>prototype</tt>s of those methods.
 * 
 * <p>For example, a defensive <tt>Point</tt> constructor can be
 * written as <tt>
 *   function Point(x, y) {
 *     return object({
 *       toString: function() { return '&lt;' + x + ',' + y + '&gt;'; },
 *       getX: function() { return x; },
 *       getY: function() { return y; }
 *     });
 *   }
 *   Object.freeze(Point.prototype);
 *   Object.freeze(Point);
 * </tt>
 */
function object(obj) {
  for (var name in obj) {
    var meth = obj[name];
    if (typeof meth === 'function') {
      if ('prototype' in meth) {
        Object.freeze(meth.prototype);
      }
      Object.freeze(meth);
    }
  }
  return Object.freeze(obj);
}


function conflict(name) { throw new Error("trait conflict: "+name) }
function makeConflictDesc(name) {
  return Object.freeze({
   get: function() { return conflict(name) },
   set: function(val) { return conflict(name) },
   enumerable: false,
   configurable: true
  });
}

function isSameDesc(desc1, desc2) {
  return (   desc1.get === desc2.get
          && desc1.set === desc2.set
          && desc1.value === desc2.value // TODO: deal with NaN and -0
          && desc1.writable === desc2.writable
          && desc1.enumerable === desc2.enumerable
          && desc1.configurable === desc2.configurable);
}

// turns an array of names or objects into an object mapping
// each of these names (or all own properties of each of these objects) to 'true'.
// (the object can be used as a set by invoking set.hasOwnProperty(element))
function makeSet(namesOrObjects) {
  var set = {};
  namesOrObjects.forEach(function (nameOrObject) {
    if (typeof nameOrObject === "string") {
      set[nameOrObject] = true;      
    } else { // nameOrObject presumed to be an object
      Object.getOwnPropertyNames(nameOrObject).forEach(function (name) {
        set[name] = true;
      });
    }
  });
  return set;
}

// composite = compose(composite, trait, {
//  alias: { oldName: newName, ... },
//  exclude: [ excludedName, excludedObject, ... ],
// })
//
// compose 'trait' with 'composite' such that:
//  trait.oldName becomes trait.newName in the composite
//  trait.excludedName does not become part of the composite
//  no own property name of excludedObject becomes part of the composite
//
// 'compose' modifies 'composite' in-place, and returns the modified composite
function compose(self, trait, opt_composition) {
   var composition = opt_composition || {};
   var aliases     = composition.alias || {};
   var exclusions  = makeSet(composition.exclude || []);
   
   Object.getOwnPropertyNames(trait).forEach(function (traitProp) {
     var traitDesc = Object.getOwnPropertyDescriptor(trait, traitProp);
     if (aliases.hasOwnProperty(traitProp)) {
       traitProp = aliases[traitProp]; // rename property
     }
     if (exclusions.hasOwnProperty(traitProp)) return; // skip

     var selfDesc = Object.getOwnPropertyDescriptor(self, traitProp);
     if (selfDesc) { // composite has a conflicting slot
       if (isSameDesc(selfDesc, traitDesc)) {
         // it's the same as the trait's slot, no problem
       } else {
         Object.defineProperty(self, traitProp, makeConflictDesc(traitProp));           
       }
     } else {
       Object.defineProperty(self, traitProp, traitDesc);
     }
  });
  return self;
}

// use is like compose, except that composite methods take strict precedence
// over trait methods (that is: name clashes result in the trait method
// being 'overridden' by the composite method, rather than in a conflict)
//
// use(c, t, advice) === compose(c, t, advice U {exclude: c})
function use(composite, trait, advice) {
  advice = advice || {};
  return compose(composite, trait, {
    alias: advice.alias || {},
    exclude: (advice.exclude || []).concat([composite])
  });
}